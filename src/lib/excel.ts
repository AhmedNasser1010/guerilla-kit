import ExcelJS from "exceljs";
import {
  EXPORT_COLUMNS,
  type ExportColumnKey,
  type ExportColumnMeta,
} from "./export-columns";

export interface ExportGroupFlag {
  id: string;
  label: string;
  accountLabel: string;
}

export interface ExportGroupRow {
  index: number;
  name: string;
  privacy: "public" | "private" | "unknown";
  memberCount: string;
  posted: boolean;
  hidden: boolean;
  manual: boolean;
  flags: ExportGroupFlag[];
  note: string;
  url: string;
}

const COLORS = {
  titleBg: "FF1E293B",
  headerBg: "FF1D4ED8",
  headerFg: "FFFFFFFF",
  border: "FFCBD5E1",
  band: "FFF8FAFC",
  white: "FFFFFFFF",
  slateText: "FF334155",
  mutedText: "FF94A3B8",
  publicBg: "FFDCFCE7",
  publicFg: "FF166534",
  privateBg: "FFFEF3C7",
  privateFg: "FF92400E",
  unknownBg: "FFF1F5F9",
  unknownFg: "FF64748B",
  postedBg: "FFDCFCE7",
  postedFg: "FF166534",
  manualBg: "FFDBEAFE",
  manualFg: "FF1D4ED8",
  hiddenBg: "FFF1F5F9",
  hiddenFg: "FF94A3B8",
  flagsBg: "FFF0F9FF",
  noFg: "FFCBD5E1",
  linkFg: "FF2563EB",
} as const;

const FLAG_COLORS: Record<string, string> = {
  "no-reshare": "FFE11D48",
  "accept-posts": "FF059669",
  "long-pending": "FFD97706",
  "auto-reject": "FF475569",
  "posts-deleted": "FF7C3AED",
  "check-again": "FF0D9488",
  "posting-disabled": "FFEA580C",
  "new-group": "FF0891B2",
};

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: COLORS.border } },
  left: { style: "thin", color: { argb: COLORS.border } },
  bottom: { style: "thin", color: { argb: COLORS.border } },
  right: { style: "thin", color: { argb: COLORS.border } },
};

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function resolveColumns(columnKeys: ExportColumnKey[]): ExportColumnMeta[] {
  const selected = new Set(columnKeys);
  const columns = EXPORT_COLUMNS.filter((c) => selected.has(c.key));
  return columns.length > 0 ? columns : EXPORT_COLUMNS;
}

function applyBaseStyle(cell: ExcelJS.Cell, banded: boolean) {
  if (banded) cell.fill = fill(COLORS.band);
  cell.border = thinBorder;
  cell.font = { color: { argb: COLORS.slateText } };
  cell.alignment = { vertical: "top" };
}

function renderCell(
  cell: ExcelJS.Cell,
  key: ExportColumnKey,
  row: ExportGroupRow
) {
  switch (key) {
    case "index": {
      cell.value = row.index;
      cell.alignment = { vertical: "top", horizontal: "center" };
      return;
    }
    case "name": {
      cell.value = row.name;
      cell.font = { bold: true, color: { argb: COLORS.slateText } };
      return;
    }
    case "privacy": {
      const styles = {
        public: { bg: COLORS.publicBg, fg: COLORS.publicFg, label: "Public" },
        private: { bg: COLORS.privateBg, fg: COLORS.privateFg, label: "Private" },
        unknown: { bg: COLORS.unknownBg, fg: COLORS.unknownFg, label: "Unknown" },
      }[row.privacy];
      cell.value = styles.label;
      cell.fill = fill(styles.bg);
      cell.font = { color: { argb: styles.fg }, bold: true };
      cell.alignment = { vertical: "top", horizontal: "center" };
      return;
    }
    case "members": {
      cell.value = row.memberCount;
      cell.alignment = { vertical: "top", horizontal: "right" };
      return;
    }
    case "posted": {
      cell.value = row.posted ? "Yes" : "No";
      cell.alignment = { vertical: "top", horizontal: "center" };
      if (row.posted) {
        cell.fill = fill(COLORS.postedBg);
        cell.font = { color: { argb: COLORS.postedFg }, bold: true };
      }
      return;
    }
    case "hidden": {
      cell.value = row.hidden ? "Yes" : "No";
      cell.alignment = { vertical: "top", horizontal: "center" };
      if (row.hidden) {
        cell.fill = fill(COLORS.hiddenBg);
        cell.font = { color: { argb: COLORS.hiddenFg }, italic: true };
      }
      return;
    }
    case "manual": {
      cell.value = row.manual ? "Yes" : "No";
      cell.alignment = { vertical: "top", horizontal: "center" };
      if (row.manual) {
        cell.fill = fill(COLORS.manualBg);
        cell.font = { color: { argb: COLORS.manualFg }, bold: true };
      }
      return;
    }
    case "flags": {
      cell.alignment = { vertical: "top", wrapText: true };
      if (row.flags.length === 0) {
        cell.value = "—";
        cell.font = { color: { argb: COLORS.noFg } };
        return;
      }
      cell.fill = fill(COLORS.flagsBg);
      const richText: ExcelJS.RichText[] = [];
      row.flags.forEach((flag, i) => {
        if (i > 0) {
          richText.push({
            text: "  ·  ",
            font: { color: { argb: COLORS.mutedText } },
          });
        }
        richText.push({
          text: flag.accountLabel
            ? `${flag.label} (${flag.accountLabel})`
            : flag.label,
          font: {
            color: { argb: FLAG_COLORS[flag.id] || COLORS.slateText },
            bold: true,
          },
        });
      });
      cell.value = { richText };
      return;
    }
    case "note": {
      cell.value = row.note || "";
      cell.alignment = { vertical: "top", wrapText: true };
      if (!row.note) cell.font = { color: { argb: COLORS.noFg } };
      return;
    }
    case "url": {
      cell.value = row.url ? { text: row.url, hyperlink: row.url } : "";
      cell.font = {
        color: { argb: row.url ? COLORS.linkFg : COLORS.noFg },
        underline: !!row.url,
      };
      cell.alignment = { vertical: "top" };
      return;
    }
  }
}

export async function buildGroupsWorkbook(
  rows: ExportGroupRow[],
  columnKeys: ExportColumnKey[]
): Promise<Buffer> {
  const columns = resolveColumns(columnKeys);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "GuerillaKit";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Groups", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  sheet.columns = columns.map((c) => ({ width: c.width }));

  const lastCol = columns.length;
  const headerRowNumber = 2;

  // Title row
  const titleRow = sheet.getRow(1);
  titleRow.height = 26;
  sheet.mergeCells(1, 1, 1, lastCol);
  const titleCell = titleRow.getCell(1);
  titleCell.value = `GuerillaKit — Groups export (${new Date().toLocaleString()})`;
  titleCell.font = { bold: true, size: 13, color: { argb: COLORS.headerFg } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  for (let c = 1; c <= lastCol; c++) {
    const cell = titleRow.getCell(c);
    cell.fill = fill(COLORS.titleBg);
    cell.border = thinBorder;
  }

  // Header row
  const headerRow = sheet.getRow(headerRowNumber);
  headerRow.height = 20;
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.label;
    cell.font = { bold: true, color: { argb: COLORS.headerFg } };
    cell.fill = fill(COLORS.headerBg);
    cell.border = thinBorder;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  rows.forEach((row, rowIndex) => {
    const dataRow = sheet.getRow(headerRowNumber + 1 + rowIndex);
    const banded = rowIndex % 2 === 1;
    columns.forEach((col, i) => {
      const cell = dataRow.getCell(i + 1);
      applyBaseStyle(cell, banded);
      renderCell(cell, col.key, row);
    });
  });

  // Auto filter over the header row
  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: lastCol },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
