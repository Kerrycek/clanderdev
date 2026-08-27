// Admin locale barrel
import { csAdmin_content } from './admin/content';
import { csAdmin_help_boxes } from './admin/help_boxes';
import { csAdmin_host_ip_addresses } from './admin/host_ip_addresses';
import { csAdmin_info } from './admin/info';
import { csAdmin_ip } from './admin/ip';
import { csAdmin_ip_addresses } from './admin/ip_addresses';
import { csAdmin_ip_assignments } from './admin/ip_assignments';
import { csAdmin_migration_plan } from './admin/migration_plan';
import { csAdmin_migration_plans } from './admin/migration_plans';
import { csAdmin_network_live } from './admin/network_live';
import { csAdmin_network_traffic_users } from './admin/network_traffic_users';
import { csAdmin_networking } from './admin/networking';
import { csAdmin_newslog } from './admin/newslog';
import { csAdmin_node } from './admin/node';
import { csAdmin_nodes } from './admin/nodes';
import { csAdmin_outages } from './admin/outages';
import { csAdmin_security_advisories } from './admin/security_advisories';
import { csAdmin_state } from './admin/state';
import { csAdmin_user } from './admin/user';
import { csAdmin_userns } from './admin/userns';
import { csAdmin_users } from './admin/users';

export const csAdmin = {
  ...csAdmin_content,
  ...csAdmin_help_boxes,
  ...csAdmin_host_ip_addresses,
  ...csAdmin_info,
  ...csAdmin_ip,
  ...csAdmin_ip_addresses,
  ...csAdmin_ip_assignments,
  ...csAdmin_migration_plan,
  ...csAdmin_migration_plans,
  ...csAdmin_network_live,
  ...csAdmin_network_traffic_users,
  ...csAdmin_networking,
  ...csAdmin_newslog,
  ...csAdmin_node,
  ...csAdmin_nodes,
  ...csAdmin_outages,
  ...csAdmin_security_advisories,
  ...csAdmin_state,
  ...csAdmin_user,
  ...csAdmin_userns,
  ...csAdmin_users,
} as const;
