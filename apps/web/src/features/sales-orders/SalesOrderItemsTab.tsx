import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SalesOrderItem } from '@/lib/api/sales-orders';
import { money } from '@/lib/format';
import { estimateTotalCents } from './createSalesOrderSchema';

/** Itens são imutáveis após a criação. A UI não oferece editar, nem finge que oferece. */
export function SalesOrderItemsTab({ items, total }: { items: SalesOrderItem[]; total: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>SKU</TableHead>
          <TableHead>Item</TableHead>
          <TableHead className="text-right">Qtd.</TableHead>
          <TableHead className="text-right">Preço unitário</TableHead>
          <TableHead className="text-right">Subtotal</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((line) => (
          <TableRow key={line.itemId}>
            <TableCell className="tabular">{line.sku}</TableCell>
            <TableCell>{line.name}</TableCell>
            <TableCell className="tabular text-right">{line.quantity}</TableCell>
            <TableCell className="tabular text-right">{money(line.unitPrice)}</TableCell>
            <TableCell className="tabular text-right">
              {/* Centavos inteiros: a Global Constraint proíbe float em aritmética de dinheiro. */}
              {money((estimateTotalCents([line]) / 100).toFixed(2))}
            </TableCell>
          </TableRow>
        ))}
        <TableRow>
          <TableCell colSpan={4} className="text-right font-medium">
            Total
          </TableCell>
          <TableCell className="tabular text-right font-semibold">{money(total)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
