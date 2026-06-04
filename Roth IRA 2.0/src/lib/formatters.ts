export const formatCurrency = (amount: number, currency: string): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

export const formatDate = (dateStr: string | undefined, dateFormat: string): string => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 'N/A';
  if (dateFormat === 'MM/DD/YYYY') return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  if (dateFormat === 'DD/MM/YYYY') return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
  return date.toISOString().split('T')[0];
};

export const formatChartAxisLabel = (value: string, range: string, dateFormat: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (range === '1D') return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return formatDate(value, dateFormat);
};
