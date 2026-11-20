import type { RouteModule } from './app';
import { catalogRoutes } from './admin/catalog';
import { roleRoutes } from './admin/roles';
import { settingsRoutes } from './admin/settings';
import { shopRoutes } from './admin/shops';
import { userRoutes } from './admin/users';
import { deliveryRoutes } from './delivery';
import { financeRoutes } from './finance';
import { notifyRoutes } from './notify';
import { orderRoutes } from './orders';

export const ALL_ROUTES: RouteModule[] = [userRoutes, roleRoutes, shopRoutes, catalogRoutes, settingsRoutes, orderRoutes, notifyRoutes, deliveryRoutes, financeRoutes];
