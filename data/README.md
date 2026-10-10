# Challenge 04 – Head Office, 8:30 a.m.
**FreshBasket Franchise Network**  ·  Data snapshot: morning of 2026-11-16 (stock); daily history up to 2026-11-15

## Files

### `compliance.csv`  (75 rows)

`store`, `inspection_date`, `checklist_score`, `open_issues`, `issue_notes`

### `customers.csv`  (1,500 rows)

`store`, `date`, `footfall`, `transactions`, `avg_bill_value`

### `inventory.csv`  (1,050 rows)

`store`, `sku`, `stock`, `reorder_level`

### `products.csv`  (42 rows)

`sku`, `product`, `category`, `price`, `perishability`, `shelf_life_days`

### `purchase_orders.csv`  (111 rows)

`po`, `supplier`, `store`, `sku`, `qty`, `expected_date`, `status`

### `sales.csv`  (54,021 rows)

`date`, `store`, `sku`, `qty_sold`, `revenue`

### `staff.csv`  (1,500 rows)

`store`, `date`, `staff_present`, `staffing_level`, `transactions_per_staff`

### `stores.csv`  (25 rows)

`store`, `location`, `franchisee`, `format`, `operating_status`

### `wastage.csv`  (8,926 rows)

`store`, `sku`, `qty_wasted`, `reason`, `date`

## Notes

- `customers.csv` and `staff.csv` are daily per store.
- `compliance.csv` has one row per inspection.
- `stores.csv` `operating_status` may contain notes about closures.

At hour 14 an updated version of one of these files will be released. Same columns, same format.