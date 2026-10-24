/**
 * Venezuelan Standard Formatters for CIMA ERP:
 * - Date: dd/mm/aaaa (e.g. 15/09/2026)
 * - Date & Time: dd/mm/aaaa hh:mm
 * - Currency detection and symbol resolution (Bs. and $)
 */

export function formatDateDDMMAAAA(dateInput: string | number | Date | undefined | null): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDateTimeDDMMAAAA(dateInput: string | number | Date | undefined | null): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export function isBolivaresPaymentMethod(paymentMethod: string | undefined | null): boolean {
  if (!paymentMethod) return false;
  const pm = paymentMethod.toLowerCase();
  return (
    pm.includes('bolívar') ||
    pm.includes('bolivar') ||
    pm.includes('punto de venta') ||
    pm.includes('ves') ||
    pm.includes('pago móvil') ||
    pm.includes('pago movil')
  );
}
