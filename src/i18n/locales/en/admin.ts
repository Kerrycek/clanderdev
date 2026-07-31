// Admin locale barrel
import { enAdmin_content } from './admin/content';
import { enAdmin_help_boxes } from './admin/help_boxes';
import { enAdmin_host_ip_addresses } from './admin/host_ip_addresses';
import { enAdmin_info } from './admin/info';
import { enAdmin_ip } from './admin/ip';
import { enAdmin_ip_addresses } from './admin/ip_addresses';
import { enAdmin_ip_assignments } from './admin/ip_assignments';
import { enAdmin_migration_plan } from './admin/migration_plan';
import { enAdmin_migration_plans } from './admin/migration_plans';
import { enAdmin_network_live } from './admin/network_live';
import { enAdmin_network_traffic_users } from './admin/network_traffic_users';
import { enAdmin_networking } from './admin/networking';
import { enAdmin_newslog } from './admin/newslog';
import { enAdmin_node } from './admin/node';
import { enAdmin_nodes } from './admin/nodes';
import { enAdmin_outages } from './admin/outages';
import { enAdmin_security_advisories } from './admin/security_advisories';
import { enAdmin_state } from './admin/state';
import { enAdmin_user } from './admin/user';
import { enAdmin_userns } from './admin/userns';
import { enAdmin_users } from './admin/users';

export const enAdmin = {
  ...enAdmin_content,
  ...enAdmin_help_boxes,
  ...enAdmin_host_ip_addresses,
  ...enAdmin_info,
  ...enAdmin_ip,
  ...enAdmin_ip_addresses,
  ...enAdmin_ip_assignments,
  ...enAdmin_migration_plan,
  ...enAdmin_migration_plans,
  ...enAdmin_network_live,
  ...enAdmin_network_traffic_users,
  ...enAdmin_networking,
  ...enAdmin_newslog,
  ...enAdmin_node,
  ...enAdmin_nodes,
  ...enAdmin_outages,
  ...enAdmin_security_advisories,
  ...enAdmin_state,
  ...enAdmin_user,
  ...enAdmin_userns,
  ...enAdmin_users,
} as const;
