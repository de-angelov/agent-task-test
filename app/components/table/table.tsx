import { Fragment, type ReactNode } from "react";

import styles from "./table.module.css";

interface TableColumn<Row> {
  header: ReactNode;
  id: string;
  renderCell: (row: Row) => ReactNode;
}

interface TableStateMessages {
  empty?: ReactNode;
  error?: ReactNode;
  loading?: ReactNode;
}

interface TableProps<Row> {
  caption?: ReactNode;
  columns: Array<TableColumn<Row>>;
  error?: ReactNode;
  getRowKey: (row: Row) => string;
  isLoading?: boolean;
  messages?: TableStateMessages;
  renderRow?: (row: Row) => ReactNode;
  rows: Row[];
}

function Table<Row>({
  caption,
  columns,
  error,
  getRowKey,
  isLoading = false,
  messages,
  renderRow,
  rows,
}: TableProps<Row>) {
  const colSpan = Math.max(columns.length, 1);
  const hasRows = rows.length > 0;
  const shouldShowState = isLoading || Boolean(error) || !hasRows;

  return (
    <div className={styles.container}>
      <table aria-busy={isLoading || undefined} className={styles.table}>
        {caption ? <caption>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shouldShowState ? (
            <TableStateRow
              colSpan={colSpan}
              error={error}
              isLoading={isLoading}
              messages={messages}
            />
          ) : (
            rows.map((row) =>
              renderRow ? (
                <Fragment key={getRowKey(row)}>{renderRow(row)}</Fragment>
              ) : (
                <tr key={getRowKey(row)}>
                  {columns.map((column) => (
                    <td key={column.id}>{column.renderCell(row)}</td>
                  ))}
                </tr>
              ),
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

interface TableStateRowProps {
  colSpan: number;
  error?: ReactNode;
  isLoading: boolean;
  messages?: TableStateMessages;
}

function TableStateRow({
  colSpan,
  error,
  isLoading,
  messages,
}: TableStateRowProps) {
  if (isLoading) {
    return (
      <tr>
        <td className={styles.state} colSpan={colSpan}>
          {messages?.loading ?? "Loading..."}
        </td>
      </tr>
    );
  }

  if (error) {
    return (
      <tr>
        <td className={styles.state} colSpan={colSpan} role="alert">
          {messages?.error ?? error}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className={styles.state} colSpan={colSpan}>
        {messages?.empty ?? "No records found."}
      </td>
    </tr>
  );
}

export { Table };
export type { TableColumn, TableProps, TableStateMessages };
