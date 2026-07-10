import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/components/AppLayout';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { CreateSalesOrderPage } from '@/features/sales-orders/CreateSalesOrderPage';
import { SalesOrderDetailPage } from '@/features/sales-orders/SalesOrderDetailPage';
import { SalesOrdersListPage } from '@/features/sales-orders/SalesOrdersListPage';
import { SchedulingPage } from '@/features/scheduling/SchedulingPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { TransportTypesPage } from '@/features/transport-types/TransportTypesPage';
import { ItemsPage } from '@/features/items/ItemsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppLayout,
    children: [
      { index: true, Component: DashboardPage },
      {
        path: 'sales-orders',
        children: [
          { index: true, Component: SalesOrdersListPage },
          { path: 'new', Component: CreateSalesOrderPage },
          { path: ':id', Component: SalesOrderDetailPage },
        ],
      },
      { path: 'scheduling', Component: SchedulingPage },
      { path: 'customers', Component: CustomersPage },
      { path: 'transport-types', Component: TransportTypesPage },
      { path: 'items', Component: ItemsPage },
    ],
  },
]);
