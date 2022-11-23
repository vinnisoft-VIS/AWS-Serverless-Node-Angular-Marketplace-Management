import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GuardService } from './auth/services/guard.service';
import { CoreComponent } from './core/components/core.component';
import { ActiveGuardService } from './auth/services/active.guard.service';
import { ErrorPageComponent } from './error-page/error-page.component';
import { UnauthorisedAccessComponent } from './unauthorised-access/unauthorised-access.component';

const routes: Routes = [
  {
    path: '',
    component: CoreComponent,
    canLoad: [GuardService],
    canActivate: [ActiveGuardService],
    children: [
      {
        path: 'dashboard',
        canActivate: [ActiveGuardService],
        loadChildren: () => import('./dashboard/dashboard.module').then((m) => m.DashboardModule),
        data: {
          breadcrumb: {
            title: 'Dashboard',
            url: '.',
          },
        },
      },
      {
        path: 'promotions',
        canActivate: [ActiveGuardService],
        loadChildren: () => import('./internal-apps/promotion/promotions.module').then(
          (m) => m.PromotionsModule,
        ),
      },
      {
        path: 'reports',
        canActivate: [ActiveGuardService],
        loadChildren: () => import('./reports/reports.module').then((m) => m.ReportsModule),
      },
      {
        path: 'inventory',
        canActivate: [ActiveGuardService],
        loadChildren: () => import('./inventory/inventory.module').then((m) => m.InventoryModule),
        data: {
          breadcrumb: {
            title: 'Inventory',
            url: '.',
          },
        },
      },
      {
        path: 'order-management',
        canActivate: [ActiveGuardService],
        loadChildren: () => import('./orders/orders.module').then((m) => m.OrdersModule),
        data: {
          breadcrumb: {
            title: 'Order management',
            url: '.',
          },
        },
      },

      {
        path: 'users-settings',
        canActivate: [ActiveGuardService],
        loadChildren: () => import('./users-settings/users-settings.module').then(
          (m) => m.UsersSettingsModule,
        ),
        data: {
          breadcrumb: {
            title: 'Settings',
            url: '.',
          },
        },
      },

      {
        path: 'applications',
        canActivate: [ActiveGuardService],
        loadChildren: () => import('./applications/applications.module').then(
          (m) => m.ApplicationsModule,
        ),
        data: {
          breadcrumb: {
            title: 'Apps',
            url: '.',
          },
        },
      },
      {
        path: 'invoices',
        canActivate: [ActiveGuardService],
        loadChildren: () => import('./invoices/invoices.module').then((m) => m.InvoicesModule),
        data: {
          breadcrumb: {
            title: 'Stock Control',
            url: '.',
          },
        },
      },
      {
        path: 'pos',
        canActivate: [ActiveGuardService],
        loadChildren: () => import('./internal-apps/pos/pos.module').then((m) => m.PosModule),
        data: {
          breadcrumb: {
            title: 'POS',
            url: '.',
          },
        },
      },
      {
        path: 'expenses',
        canActivate: [ActiveGuardService],
        loadChildren: () => import('./expenses/expenses.module').then((m) => m.ExpensesModule),
        data:{
          breadcrumb:{
            title:'Expenses',
            url:'.',
          }
        }
      },
    ],
  },
  {
    path: 'error',
    component: ErrorPageComponent,
  },
  {
    path: 'unauthorised',
    component: UnauthorisedAccessComponent,
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule { }
