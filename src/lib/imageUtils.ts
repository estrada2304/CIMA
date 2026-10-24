/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const DEFAULT_PRODUCT_IMAGE = "https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3";

export interface PresetImage {
  label: string;
  url: string;
  category: string;
}

export const PRESET_PRODUCT_IMAGES: PresetImage[] = [
  { label: 'Abarrotes / General', category: 'Alimentos', url: 'https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=400&auto=format&fit=crop&q=60' },
  { label: 'Bebidas / Refrescos', category: 'Bebidas', url: 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?w=400&auto=format&fit=crop&q=60' },
  { label: 'Licores / Vinos', category: 'Licores', url: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400&auto=format&fit=crop&q=60' },
  { label: 'Charcutería / Carnes', category: 'Charcutería', url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&auto=format&fit=crop&q=60' },
  { label: 'Limpieza / Hogar', category: 'Limpieza', url: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=400&auto=format&fit=crop&q=60' },
  { label: 'Ferretería / Herramientas', category: 'Ferretería', url: 'https://images.unsplash.com/photo-1581783342308-f792dbdd27c5?w=400&auto=format&fit=crop&q=60' },
  { label: 'Panadería / Repostería', category: 'Panadería', url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&auto=format&fit=crop&q=60' },
  { label: 'Farmacia / Cuidados', category: 'Salud', url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=60' },
  { label: 'Granos / Harinas', category: 'Alimentos', url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&auto=format&fit=crop&q=60' },
  { label: 'Lácteos / Quesos', category: 'Charcutería', url: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=400&auto=format&fit=crop&q=60' }
];

/**
 * Compresses an image file (PNG, JPG, WebP) to a web-optimized Base64 JPEG
 * with maximum dimensions (default 400x400) and ~0.75 quality.
 * Resulting size is around 15KB-25KB, ultra-lightweight, 100% persistent in Firestore and local JSON.
 */
export function compressImageFile(file: File, maxWidth = 400, maxHeight = 400, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('El archivo seleccionado no es una imagen válida.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo procesar el formato de la imagen.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(img.src);
          return;
        }

        // Clean white background for transparency support without black artifacts
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
