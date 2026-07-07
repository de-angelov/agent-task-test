import type { ReactNode } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";

interface VirtualizedTicketListProps<Item> {
  height: number;
  itemSize: number;
  items: Item[];
  renderItem: (item: Item, index: number) => ReactNode;
  width?: number | string;
}

function VirtualizedTicketList<Item>({
  height,
  itemSize,
  items,
  renderItem,
  width = "100%",
}: VirtualizedTicketListProps<Item>) {
  return (
    <FixedSizeList
      height={height}
      itemCount={items.length}
      itemData={items}
      itemSize={itemSize}
      width={width}
    >
      {({ data, index, style }: ListChildComponentProps<Item[]>) => (
        <div style={style}>{renderItem(data[index], index)}</div>
      )}
    </FixedSizeList>
  );
}

export { VirtualizedTicketList };
export type { VirtualizedTicketListProps };
