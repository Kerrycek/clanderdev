import { expect, test, type Page } from '@playwright/test';

import { bootstrapVpsAdminWindow, installHaveApiMock } from '../../fixtures';

function addressRow(page: Page, id: number) {
  return page.locator(
    `[data-testid="network.user.ip.row.${id}"]:visible, `
    + `[data-testid="network.user.ip.card.${id}"]:visible`
  );
}

test.describe('@workflow-matrix VPS network assignment failure regressions', () => {
  test('keeps an IP assignment locked after a missing action-state id', async ({ page }) => {
    let postCount = 0;
    let assigned = false;
    let exactTargetVisible = false;
    const vps = {
      id: 123,
      hostname: 'locked-vps.example',
      object_state: 'active',
      user: { id: 7, login: 'member' },
      node: {
        id: 3,
        location: { id: 10, label: 'Praha', environment: { id: 1, label: 'Production' } },
      },
    };
    const detachedIp = {
      id: 102,
      addr: '2001:db8::10',
      prefix: 128,
      network: {
        id: 12,
        ip_version: 6,
        role: 'public_access',
        primary_location: { id: 10, label: 'Praha', environment: { id: 1, label: 'Production' } },
      },
      network_interface: null,
      user: { id: 7, login: 'member' },
    };

    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 7, login: 'member', level: 1 },
      handlers: {
        'GET vpses': () => ({ vpses: [vps] }),
        'GET network_interfaces': () => ({
          network_interfaces: [{ id: 501, name: 'eth0', vps: { id: 123 } }],
        }),
        'GET ip_address_assignments': () => ({
          ip_address_assignments: assigned ? [{
            id: 9001,
            ip_address: {
              ...detachedIp,
              network_interface: { id: 501, name: 'eth0', vps: { id: 123 } },
              vps: { id: 123 },
            },
            vps: { id: 123 },
          }] : [],
        }),
        'GET ip_addresses': (ctx) => ({
          ip_addresses: ctx.searchParams.get('ip_address[assigned_to_interface]') === 'false'
            ? (assigned ? [] : [detachedIp])
            : [],
        }),
        'GET ip_addresses/102': () => ({
          ip_address: {
            ...detachedIp,
            network_interface: assigned
              ? exactTargetVisible
                ? { id: 501, name: 'eth0', vps: { id: 123 } }
                : { id: 777, name: 'eth9', vps: { id: 999 } }
              : null,
          },
        }),
        'POST ip_addresses/102/assign': () => {
          postCount += 1;
          assigned = true;
          return {
            ip_address: {
              ...detachedIp,
              network_interface: { id: 501, name: 'eth0', vps: { id: 123 } },
            },
            _meta: {},
          };
        },
      },
    });

    await page.goto('/app/networking');
    await addressRow(page, 102).getByTestId('network.user.ip.102.assign').click();
    await page.getByTestId('network.user.assign.vps').selectOption('123');
    await page.getByTestId('network.user.assign.continue').click();
    await page.getByTestId('network.user.assign.submit').click();

    await expect(page.getByTestId('network.user.assign.uncertain')).toContainText(/uncertain outcome/i);
    await expect(page.getByTestId('network.user.assign.submit')).toBeDisabled();
    await page.getByTestId('network.user.assign.submit').evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await page.waitForTimeout(100);
    expect(postCount).toBe(1);

    await page.reload();
    const uncertainty = page.getByTestId('network.user.assign.uncertain.102');
    await expect(uncertainty).toContainText(/uncertain outcome/i);
    await expect(page.getByTestId('network.user.assign.uncertain.102.acknowledge')).toBeDisabled();
    await page.getByTestId('network.user.assign.uncertain.102.open_tasks').click();
    await page.getByTestId('tasks.close-button').click();
    await page.getByTestId('network.user.assign.uncertain.102.acknowledge').click();
    await expect(page.getByTestId('network.user.assign.uncertain.102.error')).toBeVisible();
    await expect(uncertainty).toHaveCount(1);
    await expect(page.getByTestId('tasks.drawer')).toBeVisible();
    await page.getByTestId('tasks.close-button').click();

    exactTargetVisible = true;
    await page.getByTestId('network.user.assign.uncertain.102.acknowledge').click();
    await expect(uncertainty).toHaveCount(0);
    await expect(addressRow(page, 102).getByText('locked-vps.example')).toBeVisible();
    expect(postCount).toBe(1);
  });

  test('serializes the same detached IP across tabs targeting different VPSes', async ({ page }) => {
    const secondPage = await page.context().newPage();
    let postCount = 0;
    const vpses = [123, 124].map((id) => ({
      id,
      hostname: `target-${id}.example`,
      object_state: 'active',
      user: { id: 7, login: 'member' },
      node: {
        id: id - 120,
        location: { id: 10, label: 'Praha', environment: { id: 1, label: 'Production' } },
      },
    }));
    const detachedIp = {
      id: 202,
      addr: '2001:db8::20',
      prefix: 128,
      network: {
        id: 22,
        ip_version: 6,
        role: 'public_access',
        primary_location: { id: 10, label: 'Praha', environment: { id: 1, label: 'Production' } },
      },
      network_interface: null,
      user: { id: 7, login: 'member' },
    };
    const handlers = {
      'GET vpses': () => ({ vpses }),
      'GET network_interfaces': (ctx: { searchParams: URLSearchParams }) => {
        const vpsId = Number(ctx.searchParams.get('network_interface[vps]'));
        return { network_interfaces: [{ id: vpsId + 500, name: 'eth0', vps: { id: vpsId } }] };
      },
      'GET ip_address_assignments': () => ({ ip_address_assignments: [] }),
      'GET ip_addresses': (ctx: { searchParams: URLSearchParams }) => ({
        ip_addresses: ctx.searchParams.get('ip_address[assigned_to_interface]') === 'false'
          ? [detachedIp]
          : [],
      }),
      'POST ip_addresses/202/assign': () => {
        postCount += 1;
        return { ip_address: detachedIp, _meta: {} };
      },
    };

    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await bootstrapVpsAdminWindow(secondPage, { sessionToken: 'TEST' });
    await installHaveApiMock(page, { user: { id: 7, login: 'member', level: 1 }, handlers });
    await installHaveApiMock(secondPage, { user: { id: 7, login: 'member', level: 1 }, handlers });
    await Promise.all([page.goto('/app/networking'), secondPage.goto('/app/networking')]);

    for (const [targetPage, vpsId] of [[page, '123'], [secondPage, '124']] as const) {
      await addressRow(targetPage, 202).getByTestId('network.user.ip.202.assign').click();
      await targetPage.getByTestId('network.user.assign.vps').selectOption(vpsId);
      await targetPage.getByTestId('network.user.assign.continue').click();
      await expect(targetPage.getByTestId('network.user.assign.submit')).toBeEnabled();
    }

    await Promise.all([
      page.getByTestId('network.user.assign.submit').evaluate((button) => (button as HTMLButtonElement).click()),
      secondPage.getByTestId('network.user.assign.submit').evaluate((button) => (button as HTMLButtonElement).click()),
    ]);

    await expect.poll(() => postCount).toBe(1);
    await expect(page.getByTestId('network.user.assign.submit')).toBeDisabled();
    await expect(secondPage.getByTestId('network.user.assign.submit')).toBeDisabled();
    await secondPage.close();
  });

  test('serializes a direct route assignment across two VPS detail tabs', async ({ page }) => {
    const secondPage = await page.context().newPage();
    let postCount = 0;
    let assignedInterface: number | null = null;
    const makeVps = (id: number) => ({
      id,
      hostname: `detail-${id}.example`,
      object_state: 'active',
      is_running: true,
      enable_network: true,
      cpus: 2,
      memory: 2048,
      swap: 0,
      diskspace: 20480,
      user: { id: 7, login: 'member' },
      node: { id: id - 120, location: { id: 10, label: 'Praha' } },
    });
    const detachedIp = {
      id: 302,
      addr: '2001:db8::30',
      prefix: 128,
      network: { id: 32, ip_version: 6, role: 'public_access', location: { id: 10, label: 'Praha' } },
      network_interface: null,
      user: { id: 7, login: 'member' },
    };
    const handlers = {
      'GET vpses/123': () => ({ vps: makeVps(123) }),
      'GET vpses/124': () => ({ vps: makeVps(124) }),
      'GET network_interfaces': (ctx: { searchParams: URLSearchParams }) => {
        const vpsId = Number(ctx.searchParams.get('network_interface[vps]'));
        return { network_interfaces: [{ id: vpsId + 500, name: 'eth0', vps: { id: vpsId } }] };
      },
      'GET network_interface_accountings': () => ({ network_interface_accountings: [] }),
      'GET host_ip_addresses': () => ({ host_ip_addresses: [] }),
      'GET ip_addresses': () => ({
        ip_addresses: [{
          ...detachedIp,
          network_interface: assignedInterface ? { id: assignedInterface } : null,
        }],
      }),
      'GET ip_addresses/302': () => ({
        ip_address: {
          ...detachedIp,
          network_interface: assignedInterface
            ? { id: assignedInterface, vps: { id: assignedInterface - 500 } }
            : null,
        },
      }),
      'POST ip_addresses/302/assign': async (ctx: { reqJson?: unknown }) => {
        postCount += 1;
        const body = ctx.reqJson as { ip_address?: { network_interface?: number } };
        assignedInterface = Number(body.ip_address?.network_interface);
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { ip_address: detachedIp, _meta: {} };
      },
    };

    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await bootstrapVpsAdminWindow(secondPage, { sessionToken: 'TEST' });
    await installHaveApiMock(page, { user: { id: 7, login: 'member', level: 1 }, handlers });
    await installHaveApiMock(secondPage, { user: { id: 7, login: 'member', level: 1 }, handlers });
    await Promise.all([page.goto('/app/vps/123/network'), secondPage.goto('/app/vps/124/network')]);

    for (const [targetPage, interfaceId] of [[page, '623'], [secondPage, '624']] as const) {
      await targetPage.getByTestId('vps.network.ip_addresses.unassigned.302.assign').click();
      await expect(targetPage.getByTestId('network.user.assign.interface')).toHaveValue(interfaceId);
      await targetPage.getByTestId('network.user.assign.continue').click();
      await expect(targetPage.getByTestId('network.user.assign.address')).toHaveValue('302');
      await expect(targetPage.getByTestId('network.user.assign.submit')).toBeEnabled();
    }

    await Promise.all([
      page.getByTestId('network.user.assign.submit').evaluate((button) => {
        (button as HTMLButtonElement).click();
      }),
      secondPage.getByTestId('network.user.assign.submit').evaluate((button) => {
        (button as HTMLButtonElement).click();
      }),
    ]);

    await expect.poll(() => postCount).toBe(1);
    await expect(page.getByTestId('network.user.assign.submit')).toBeDisabled();
    await expect(secondPage.getByTestId('network.user.assign.submit')).toBeDisabled();
    await page.reload();
    await expect(page.getByTestId('vps.network.route_assign.uncertain.302')).toBeVisible();
    await secondPage.close();
  });

  test('serializes owner update and route removal for the same IP across admin and user views', async ({ page }) => {
    const secondPage = await page.context().newPage();
    let freeCount = 0;
    let ownerCount = 0;
    const vps = {
      id: 123,
      hostname: 'cross-mode-network.example',
      object_state: 'active',
      is_running: true,
      enable_network: true,
      cpus: 2,
      memory: 2048,
      swap: 0,
      diskspace: 20480,
      user: { id: 7, login: 'member' },
      node: { id: 3, location: { id: 10, label: 'Praha' } },
    };
    const assignedIp = {
      id: 402,
      addr: '198.51.100.42',
      prefix: 32,
      routed: true,
      network: { id: 42, ip_version: 4, role: 'public_access', location: { id: 10, label: 'Praha' } },
      network_interface: { id: 501, name: 'eth0', vps: { id: 123 } },
      user: { id: 7, login: 'member' },
    };
    const handlers = {
      'GET vpses/123': () => ({ vps }),
      'GET network_interfaces': () => ({
        network_interfaces: [{ id: 501, name: 'eth0', vps: { id: 123 } }],
      }),
      'GET network_interface_accountings': () => ({ network_interface_accountings: [] }),
      'GET host_ip_addresses': () => ({ host_ip_addresses: [] }),
      'GET ip_addresses': () => ({ ip_addresses: [assignedIp] }),
      'GET environments': () => ({ environments: [{ id: 3, label: 'Production' }] }),
      'GET transaction_chains': () => ({ transaction_chains: [] }),
      'POST ip_addresses/402/free': async () => {
        freeCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { ip_address: assignedIp, _meta: {} };
      },
      'PUT ip_addresses/402': async () => {
        ownerCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { ip_address: assignedIp, _meta: {} };
      },
    };

    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await bootstrapVpsAdminWindow(secondPage, { sessionToken: 'TEST' });
    await installHaveApiMock(page, { user: { id: 7, login: 'member', level: 90 }, handlers });
    await installHaveApiMock(secondPage, { user: { id: 7, login: 'member', level: 1 }, handlers });
    await Promise.all([page.goto('/admin/vps/123/network'), secondPage.goto('/app/vps/123/network')]);

    await page.getByTestId('vps.network.ip_addresses.item.402.owner').click();
    await page.getByTestId('vps.network.ip_addresses.owner.user').fill('77');
    await page.getByTestId('vps.network.ip_addresses.owner.environment').selectOption('3');
    await expect(page.getByTestId('vps.network.ip_addresses.owner.submit')).toBeEnabled();

    await secondPage.getByTestId('vps.network.ip_addresses.item.402.free_route').click();
    await expect(secondPage.getByTestId('vps.network.ip_addresses.free_route_confirm.confirm')).toBeEnabled();

    await Promise.all([
      page.getByTestId('vps.network.ip_addresses.owner.submit').evaluate((button) => {
        (button as HTMLButtonElement).click();
      }),
      secondPage.getByTestId('vps.network.ip_addresses.free_route_confirm.confirm').evaluate((button) => {
        (button as HTMLButtonElement).click();
      }),
    ]);

    await expect.poll(() => freeCount + ownerCount).toBe(1);
    await page.waitForTimeout(200);
    await page.getByTestId('vps.network.ip_addresses.owner.submit').evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await secondPage.getByTestId('vps.network.ip_addresses.free_route_confirm.confirm').evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await page.waitForTimeout(100);
    expect(freeCount + ownerCount).toBe(1);

    await Promise.all([page.reload(), secondPage.reload()]);
    await expect(page.getByTestId('vps.network.route_assign.uncertain.402')).toBeVisible();
    await expect(secondPage.getByTestId('vps.network.route_assign.uncertain.402')).toBeVisible();
    await secondPage.close();
  });

  test('reconciles an ambiguous route removal only after the IP is exactly detached', async ({ page }) => {
    let freeCount = 0;
    let detached = false;
    const vps = {
      id: 123,
      hostname: 'free-reconcile.example',
      object_state: 'active',
      is_running: true,
      enable_network: true,
      cpus: 2,
      memory: 2048,
      swap: 0,
      diskspace: 20480,
      user: { id: 7, login: 'member' },
      node: { id: 3, location: { id: 10, label: 'Praha' } },
    };
    const currentIp = () => ({
      id: 502,
      addr: '198.51.100.52',
      prefix: 32,
      routed: true,
      network: {
        id: 52,
        ip_version: 4,
        role: 'public_access',
        primary_location: { id: 10, label: 'Praha', environment: { id: 3, label: 'Production' } },
      },
      network_interface: detached ? null : { id: 501, name: 'eth0', vps: { id: 123 } },
      vps: detached ? null : { id: 123 },
      user: { id: 7, login: 'member' },
      charged_environment: { id: 3, label: 'Production' },
    });

    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 7, login: 'member', level: 1 },
      handlers: {
        'GET vpses': () => ({ vpses: [vps] }),
        'GET vpses/123': () => ({ vps }),
        'GET network_interfaces': () => ({
          network_interfaces: [{ id: 501, name: 'eth0', vps: { id: 123 } }],
        }),
        'GET network_interface_accountings': () => ({ network_interface_accountings: [] }),
        'GET host_ip_addresses': () => ({ host_ip_addresses: [] }),
        'GET ip_address_assignments': () => ({
          ip_address_assignments: detached ? [] : [{
            id: 9502,
            ip_address: currentIp(),
            vps: { id: 123 },
          }],
        }),
        'GET ip_addresses': (ctx) => ({
          ip_addresses: ctx.searchParams.get('ip_address[assigned_to_interface]') === 'false'
            ? (detached ? [currentIp()] : [])
            : (detached ? [] : [currentIp()]),
        }),
        'GET ip_addresses/502': () => ({ ip_address: currentIp() }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'POST ip_addresses/502/free': () => {
          freeCount += 1;
          return { ip_address: currentIp(), _meta: {} };
        },
      },
    });

    await page.goto('/app/vps/123/network');
    await page.getByTestId('vps.network.ip_addresses.item.502.free_route').click();
    await page.getByTestId('vps.network.ip_addresses.free_route_confirm.confirm').click();
    await expect.poll(() => freeCount).toBe(1);

    await page.reload();
    await page.goto('/app/networking');
    const uncertainty = page.getByTestId('network.user.assign.uncertain.502');
    await expect(uncertainty).toBeVisible();
    await page.getByTestId('network.user.assign.uncertain.502.open_tasks').click();
    await page.getByTestId('tasks.close-button').click();
    await page.getByTestId('network.user.assign.uncertain.502.acknowledge').click();
    await expect(page.getByTestId('network.user.assign.uncertain.502.error')).toBeVisible();
    await expect(uncertainty).toBeVisible();
    await page.getByTestId('tasks.close-button').click();

    detached = true;
    await page.getByTestId('network.user.assign.uncertain.502.acknowledge').click();
    await expect(uncertainty).toHaveCount(0);
    expect(freeCount).toBe(1);
  });

  test('reconciles an ambiguous owner update only for the exact user and environment', async ({ page }) => {
    let ownerCount = 0;
    let exactOwnerVisible = false;
    const vps = {
      id: 123,
      hostname: 'owner-reconcile.example',
      object_state: 'active',
      is_running: true,
      enable_network: true,
      cpus: 2,
      memory: 2048,
      swap: 0,
      diskspace: 20480,
      user: { id: 7, login: 'member' },
      node: { id: 3, location: { id: 10, label: 'Praha' } },
    };
    const currentIp = () => ({
      id: 602,
      addr: '198.51.100.62',
      prefix: 32,
      routed: true,
      network: {
        id: 62,
        ip_version: 4,
        role: 'public_access',
        primary_location: { id: 10, label: 'Praha', environment: { id: 3, label: 'Production' } },
      },
      network_interface: { id: 501, name: 'eth0', vps: { id: 123 } },
      vps: { id: 123 },
      user: exactOwnerVisible ? { id: 77, login: 'target' } : { id: 7, login: 'member' },
      charged_environment: exactOwnerVisible
        ? { id: 4, label: 'Target environment' }
        : { id: 3, label: 'Production' },
    });

    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 7, login: 'member', level: 90 },
      handlers: {
        'GET vpses': () => ({ vpses: [vps] }),
        'GET vpses/123': () => ({ vps }),
        'GET network_interfaces': () => ({
          network_interfaces: [{ id: 501, name: 'eth0', vps: { id: 123 } }],
        }),
        'GET network_interface_accountings': () => ({ network_interface_accountings: [] }),
        'GET host_ip_addresses': () => ({ host_ip_addresses: [] }),
        'GET ip_address_assignments': () => ({
          ip_address_assignments: [{ id: 9602, ip_address: currentIp(), vps: { id: 123 } }],
        }),
        'GET ip_addresses': () => ({ ip_addresses: [currentIp()] }),
        'GET ip_addresses/602': () => ({ ip_address: currentIp() }),
        'GET environments': () => ({
          environments: [
            { id: 3, label: 'Production' },
            { id: 4, label: 'Target environment' },
          ],
        }),
        'GET transaction_chains': () => ({ transaction_chains: [] }),
        'PUT ip_addresses/602': () => {
          ownerCount += 1;
          return { ip_address: currentIp(), _meta: {} };
        },
      },
    });

    await page.goto('/admin/vps/123/network');
    await page.getByTestId('vps.network.ip_addresses.item.602.owner').click();
    await page.getByTestId('vps.network.ip_addresses.owner.user').fill('77');
    await page.getByTestId('vps.network.ip_addresses.owner.environment').selectOption('4');
    await page.getByTestId('vps.network.ip_addresses.owner.submit').click();
    await expect.poll(() => ownerCount).toBe(1);

    await page.reload();
    await page.goto('/app/networking');
    const uncertainty = page.getByTestId('network.user.assign.uncertain.602');
    await expect(uncertainty).toBeVisible();
    await page.getByTestId('network.user.assign.uncertain.602.open_tasks').click();
    await page.getByTestId('tasks.close-button').click();
    await page.getByTestId('network.user.assign.uncertain.602.acknowledge').click();
    await expect(page.getByTestId('network.user.assign.uncertain.602.error')).toBeVisible();
    await expect(uncertainty).toBeVisible();
    await page.getByTestId('tasks.close-button').click();

    exactOwnerVisible = true;
    await page.getByTestId('network.user.assign.uncertain.602.acknowledge').click();
    await expect(uncertainty).toHaveCount(0);
    expect(ownerCount).toBe(1);
  });

  test('keeps host-address delete locked while its returned action state is running', async ({ page }) => {
    let deleteCount = 0;
    const vps = {
      id: 123,
      hostname: 'host-delete.example',
      object_state: 'active',
      is_running: true,
      enable_network: true,
      cpus: 2,
      memory: 2048,
      swap: 0,
      diskspace: 20480,
      user: { id: 7, login: 'member' },
      node: { id: 3, location: { id: 10, label: 'Praha' } },
    };
    const hostAddress = {
      id: 51,
      addr: '198.51.100.51',
      assigned: false,
      user_created: true,
      ip_address: { id: 1, addr: '198.51.100.0', network_interface: { id: 501 } },
    };
    await bootstrapVpsAdminWindow(page, { sessionToken: 'TEST' });
    await installHaveApiMock(page, {
      user: { id: 7, login: 'member', level: 1 },
      handlers: {
        'GET vpses/123': () => ({ vps }),
        'GET network_interfaces': () => ({ network_interfaces: [{ id: 501, name: 'eth0', vps: { id: 123 } }] }),
        'GET network_interface_accountings': () => ({ network_interface_accountings: [] }),
        'GET ip_addresses': () => ({ ip_addresses: [] }),
        'GET host_ip_addresses': () => ({ host_ip_addresses: [hostAddress] }),
        'DELETE host_ip_addresses/51': () => {
          deleteCount += 1;
          return { _meta: { action_state_id: 880 } };
        },
        'GET action_states/880': () => ({
          action_state: {
            id: 880,
            label: 'Delete host IP address',
            finished: false,
            status: true,
            current: 0,
            total: 1,
          },
        }),
      },
    });

    await page.goto('/app/vps/123/network');
    await page.getByTestId('vps.network.host_addresses.row.51.delete').click();
    await page.getByTestId('vps.network.host_addresses.delete_confirm.confirm').click();
    await expect.poll(() => deleteCount).toBe(1);
    await expect(page.getByTestId('vps.network.host_addresses.row.51.delete')).toHaveAttribute('aria-disabled', 'true');

    await page.reload();
    await expect(page.getByTestId('vps.network.host_addresses.row.51.delete')).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('vps.network.host_addresses.row.51.delete').evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await page.waitForTimeout(100);
    expect(deleteCount).toBe(1);
  });
});
