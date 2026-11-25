<script setup lang="ts">
export type TableColumn =
  | string
  | {
      key: string;
      label: string;
    };

const props = withDefaults(
  defineProps<{
    columns: TableColumn[];
    rows: Record<string, unknown>[];
    rowKey?: string;
    showActions?: boolean;
  }>(),
  {
    showActions: true,
  },
);

function columnKey(col: TableColumn): string {
  return typeof col === 'string' ? col : col.key;
}

function columnLabel(col: TableColumn): string {
  return typeof col === 'string' ? col : col.label;
}

function cellValue(row: Record<string, unknown>, col: TableColumn): string {
  const value = row[columnKey(col)];
  return value == null || value === '' ? '–' : String(value);
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="sv-table">
      <thead>
        <tr>
          <th v-for="col of columns" :key="columnKey(col)">{{ columnLabel(col) }}</th>
          <th v-if="showActions" class="w-28">Ações</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) of rows" :key="rowKey ? String(row[rowKey]) : index">
          <td v-for="col of columns" :key="columnKey(col)" class="text-sm">
            {{ cellValue(row, col) }}
          </td>
          <td v-if="showActions" class="text-sm">
            <slot name="actions" :row="row" />
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td :colspan="columns.length + (showActions ? 1 : 0)" class="text-center py-8 text-sv-muted">
            Nenhum registro encontrado.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
