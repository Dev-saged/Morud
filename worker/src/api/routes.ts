import type { RouteModule } from './app';
import { catalogRoutes } from './admin/catalog';
import { roleRoutes } from './admin/roles';
import { settingsRoutes } from './admin/settings';
import { shopRoutes } from './admin/shops';
import { userRoutes } from './admin/users';

export const ALL_ROUTES: RouteModule[] = [userRoutes, roleRoutes, shopRoutes, catalogRoutes, settingsRoutes];
