import React, { useState } from 'react';
import { 
  Briefcase, Search, Plus, Trash, Edit2, CheckCircle, AlertCircle, X, MapPin, Mail, Phone, User as UserIcon,
  Upload, Download, Check, FileSpreadsheet
} from 'lucide-react';
import { Supplier } from '../types';

interface SuppliersModuleProps {
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  currentUser: { role: string };
}

export default function SuppliersModule({
  suppliers,
  setSuppliers,
  currentUser
}: SuppliersModuleProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Import / Export states for suppliers
  const [showImportExport, setShowImportExport] = useState(false);
  const [importText, setImportText] = useState('');
  const [parsedSuppliers, setParsedSuppliers] = useState<Supplier[]>([]);
  const [importStep, setImportStep] = useState<'upload' | 'preview'>('upload');
  const [duplicateStrategy, setDuplicateStrategy] = useState<'overwrite' | 'skip'>('skip');
  const [importError, setImportError] = useState<string | null>(null);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // Reusable native CSV parser that handles double quotes and escapes
  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = [];
    let currentLine: string[] = [];
    let inQuotes = false;
    let currentValue = '';

    for (let i = 0; i < text.length; i++) {
       const char = text[i];
       const nextChar = text[i + 1];

       if (char === '"') {
         if (inQuotes && nextChar === '"') {
           currentValue += '"';
           i++; // skip next quote
         } else {
           inQuotes = !inQuotes;
         }
       } else if (char === ',' && !inQuotes) {
         currentLine.push(currentValue.trim());
         currentValue = '';
       } else if ((char === '\r' || char === '\n') && !inQuotes) {
         if (char === '\r' && nextChar === '\n') {
           i++;
         }
         currentLine.push(currentValue.trim());
         lines.push(currentLine);
         currentLine = [];
         currentValue = '';
       } else {
         currentValue += char;
       }
    }
    if (currentLine.length > 0 || currentValue !== '') {
      currentLine.push(currentValue.trim());
      lines.push(currentLine);
    }
    return lines;
  };

  // Fuzzy column detector and CSV parser for suppliers
  const handleCSVImport = (text: string) => {
    try {
      setImportError(null);
      setImportLogs([]);
      const rawLines = parseCSV(text);
      if (rawLines.length < 2) {
        throw new Error("El archivo CSV debe contener al menos una fila de cabecera y una de datos.");
      }
      
      const headers = rawLines[0].map((h: string) => h.toLowerCase().trim());
      
      const findIndex = (keywords: string[]) => {
        return headers.findIndex((h: string) => 
          keywords.some(kw => h.includes(kw))
        );
      };

      const rifIndex = findIndex(['rif', 'cedula', 'cédula', 'identificacion', 'id', 'rif/ci', 'rif_ci', 'dni', 'proveedor_rif']);
      const nameIndex = findIndex(['name', 'nombre', 'razon', 'razón', 'proveedor', 'razon_social']);
      const phoneIndex = findIndex(['phone', 'telefono', 'teléfono', 'celular', 'proveedor_telefono']);
      const emailIndex = findIndex(['email', 'correo', 'mail', 'contacto_correo']);
      const addressIndex = findIndex(['address', 'direccion', 'dirección', 'fiscal', 'almacen']);
      const contactIndex = findIndex(['contact', 'persona', 'contacto', 'atencion', 'encargado']);

      if (nameIndex === -1) {
        throw new Error("No se pudo detectar la columna con el NOMBRE del proveedor. Verifique sus cabeceras.");
      }

      const list: Supplier[] = [];
      const logs: string[] = [];

      for (let i = 1; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (line.length === 0 || (line.length === 1 && line[0] === '')) continue;

        let rawRif = rifIndex !== -1 && line[rifIndex] ? line[rifIndex].replace(/['"\s-]/g, '').toUpperCase() : '';
        if (!rawRif) {
          rawRif = "PROV-" + Math.floor(Math.random() * 900000 + 100000);
        } else {
          // Normalize to common J- format
          if (/^\d+$/.test(rawRif)) {
            rawRif = "J-" + rawRif;
          }
        }

        const name = line[nameIndex] ? line[nameIndex].replace(/^["']|["']$/g, '').trim() : '';
        if (!name) {
          logs.push(`Fila ${i + 1}: Omitida, el nombre está vacío.`);
          continue;
        }

        const phone = phoneIndex !== -1 && line[phoneIndex] ? line[phoneIndex].replace(/^["']|["']$/g, '').trim() : undefined;
        const email = emailIndex !== -1 && line[emailIndex] ? line[emailIndex].replace(/^["']|["']$/g, '').trim() : undefined;
        const address = addressIndex !== -1 && line[addressIndex] ? line[addressIndex].replace(/^["']|["']$/g, '').trim() : undefined;
        const contactPerson = contactIndex !== -1 && line[contactIndex] ? line[contactIndex].replace(/^["']|["']$/g, '').trim() : undefined;

        list.push({
          id: 'prov-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          name,
          rif: rawRif,
          phone,
          email,
          address,
          contactPerson
        });
      }

      setParsedSuppliers(list);
      setImportLogs(logs);
      setImportStep('preview');
    } catch (err: any) {
      setImportError(err.message || "Error al procesar el archivo CSV.");
    }
  };

  // JSON parser for suppliers
  const handleJSONImport = (text: string) => {
    try {
      setImportError(null);
      setImportLogs([]);
      const data = JSON.parse(text);
      const rawList = Array.isArray(data) ? data : (data.suppliers || []);
      if (!Array.isArray(rawList)) {
        throw new Error("Formato JSON inválido. Debe ser una lista [] de proveedores.");
      }

      const list: Supplier[] = [];
      const logs: string[] = [];

      rawList.forEach((item: any, idx: number) => {
        const name = item.name || item.nombre || '';
        if (!name) {
          logs.push(`Registro en posición ${idx + 1}: Omitido por no tener nombre válido.`);
          return;
        }
        let rawRif = item.rif || item.cedula || item.rif_ci || item.dni || ("PROV-" + Math.floor(Math.random() * 900000 + 100000));
        if (/^\d+$/.test(String(rawRif))) {
          rawRif = "J-" + rawRif;
        }

        list.push({
          id: item.id || ('prov-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
          name: String(name),
          rif: String(rawRif).toUpperCase(),
          phone: item.phone || item.telefono ? String(item.phone || item.telefono) : undefined,
          email: item.email || item.correo ? String(item.email || item.correo) : undefined,
          address: item.address || item.direccion ? String(item.address || item.direccion) : undefined,
          contactPerson: item.contactPerson || item.contacto ? String(item.contactPerson || item.contacto) : undefined
        });
      });

      setParsedSuppliers(list);
      setImportLogs(logs);
      setImportStep('preview');
    } catch (err: any) {
      setImportError("Error al analizar archivo JSON: " + err.message);
    }
  };

  // Drag handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (file.name.endsWith('.json')) {
        handleJSONImport(text);
      } else {
        handleCSVImport(text);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = () => {
    let updatedList = [...suppliers];
    let overwroteCount = 0;
    let addedCount = 0;
    let skippedCount = 0;

    parsedSuppliers.forEach(s => {
      const existingIdx = updatedList.findIndex(x => x.rif.toUpperCase() === s.rif.toUpperCase());
      if (existingIdx !== -1) {
        if (duplicateStrategy === 'overwrite') {
          updatedList[existingIdx] = {
            ...updatedList[existingIdx],
            ...s,
            id: updatedList[existingIdx].id
          };
          overwroteCount++;
        } else {
          skippedCount++;
        }
      } else {
        updatedList.push(s);
        addedCount++;
      }
    });

    setSuppliers(updatedList);
    localStorage.setItem('siga_suppliers', JSON.stringify(updatedList));

    alert(`✅ Importación de proveedores completada:\n- ${addedCount} nuevos añadidos.\n- ${overwroteCount} actualizados.\n- ${skippedCount} omitidos.`);
    
    setParsedSuppliers([]);
    setImportText('');
    setImportStep('upload');
    setShowImportExport(false);
  };

  const handleExportCSV = () => {
    const headers = ["R.I.F. Proveedor", "Nombre o Razón Social", "Persona de Contacto", "Teléfono", "Correo Electrónico", "Dirección Física"];
    const rows = suppliers.map(s => [
      `"${s.rif}"`,
      `"${s.name.replace(/"/g, '""')}"`,
      `"${s.contactPerson || ''}"`,
      `"${s.phone || ''}"`,
      `"${s.email || ''}"`,
      `"${(s.address || '').replace(/"/g, '""')}"`
    ]);

    const bom = '\uFEFF';
    const csvContent = bom + headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `SigaInvent_Proveedores_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(suppliers, null, 2))}`;
    const link = document.createElement("a");
    link.setAttribute("href", jsonString);
    link.setAttribute("download", `SigaInvent_Proveedores_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Form Fields
  const [name, setName] = useState('');
  const [rif, setRif] = useState('J-');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [contactPerson, setContactPerson] = useState('');

  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const canEdit = currentUser.role === 'Administrador' || currentUser.role === 'Almacenista';

  // Search filter
  const filteredSuppliers = suppliers.filter(s => {
    if (!s) return false;
    const term = (searchTerm || '').toLowerCase().trim();
    if (!term) return true;
    return (
      (s.name || '').toLowerCase().includes(term) ||
      (s.rif || '').toLowerCase().includes(term) ||
      (s.phone && s.phone.includes(term)) ||
      (s.email && (s.email || '').toLowerCase().includes(term)) ||
      (s.contactPerson && (s.contactPerson || '').toLowerCase().includes(term))
    );
  });

  const openAddModal = () => {
    setEditingSupplier(null);
    setName('');
    setRif('J-');
    setPhone('');
    setEmail('');
    setAddress('');
    setContactPerson('');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setName(supplier.name);
    setRif(supplier.rif);
    setPhone(supplier.phone || '');
    setEmail(supplier.email || '');
    setAddress(supplier.address || '');
    setContactPerson(supplier.contactPerson || '');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('El nombre o razón social del proveedor es obligatorio.');
      return;
    }

    if (!rif.trim() || rif.trim() === 'J-' || rif.trim() === 'V-') {
      setFormError('El RIF comercial del proveedor es obligatorio.');
      return;
    }

    // Format RIF
    const formattedRif = rif.trim().toUpperCase();

    // Check duplicate RIF
    const duplicate = suppliers.find(s => s.rif.toUpperCase() === formattedRif && (!editingSupplier || s.id !== editingSupplier.id));
    if (duplicate) {
      setFormError(`Ya existe un proveedor registrado bajo el RIF ${formattedRif} (${duplicate.name}).`);
      return;
    }

    if (editingSupplier) {
      // Modify
      const updated = suppliers.map(s => {
        if (s.id === editingSupplier.id) {
          return {
            ...s,
            name: name.trim(),
            rif: formattedRif,
            phone: phone.trim() || undefined,
            email: email.trim() || undefined,
            address: address.trim() || undefined,
            contactPerson: contactPerson.trim() || undefined
          };
        }
        return s;
      });
      setSuppliers(updated);
      setSuccessMessage('Proveedor actualizado con éxito.');
    } else {
      // Create new
      const newSupplier: Supplier = {
        id: 'sup-' + Date.now(),
        name: name.trim(),
        rif: formattedRif,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        contactPerson: contactPerson.trim() || undefined
      };
      setSuppliers([newSupplier, ...suppliers]);
      setSuccessMessage('Proveedor registrado con éxito.');
    }

    setIsModalOpen(false);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleDeleteSupplier = (id: string, name: string) => {
    if (currentUser.role !== 'Administrador') {
      alert('⛔ Permiso Denegado: Solo el Administrador principal puede dar de baja a los proveedores registrados.');
      return;
    }
    if (confirm(`¿Está seguro de que desea eliminar al proveedor "${name}"? Todas las órdenes asociadas anteriores seguirán registradas.`)) {
      setSuppliers(suppliers.filter(s => s.id !== id));
      setSuccessMessage('Proveedor removido con éxito.');
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* HEADER BANNER */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono text-orange-400 uppercase tracking-widest block font-bold">MÓDULO DE PROVEEDORES</span>
          <h2 className="text-xl font-bold font-mono tracking-wider text-white mt-1">Gestión de Proveedores y Distribuidores</h2>
          <p className="text-xs text-zinc-400 mt-1 select-none">
            Administre la cartera de fabricantes y distribuidores de importaciones para el abastecimiento y carga de mercadería en almacenes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => setShowImportExport(!showImportExport)}
            className={`px-4 py-2 border rounded font-bold text-xs select-none transition flex items-center gap-1.5 shadow font-mono uppercase tracking-wider ${
              showImportExport
                ? 'bg-orange-950/40 border-orange-550 text-orange-400'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-orange-400" /> Importar / Exportar
          </button>

          {canEdit && (
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-550 active:bg-orange-700 text-black text-xs font-extrabold rounded select-none transition flex items-center gap-1.5 shadow font-mono uppercase tracking-wider"
            >
              <Plus className="w-4 h-4" /> Registrar Proveedor
            </button>
          )}
        </div>
      </div>

      {/* Import / Export dashboard panel for suppliers */}
      {showImportExport && (
        <div className="p-5 bg-zinc-950 border border-zinc-900 rounded-lg space-y-5 shadow-xl animate-slide-in">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-zinc-900 pb-3 gap-2">
            <div>
              <h3 className="font-bold text-white text-xs uppercase tracking-wider font-mono text-orange-455 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-orange-400" /> Importación & Exportación de Proveedores
              </h3>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Soporta archivos Excel CSV delimitados por comas o archivos JSON estructurados.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowImportExport(false)}
              className="p-1 hover:bg-zinc-900 rounded text-zinc-400 hover:text-zinc-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {importStep === 'upload' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 font-mono">
              {/* Left Side: Import File/Paste */}
              <div className="space-y-3.5">
                <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono font-bold block">📥 Cargar Datos</span>
                
                {/* Drag and Drop Box */}
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded p-6 text-center transition flex flex-col items-center justify-center cursor-pointer ${
                    dragActive
                      ? 'border-orange-500 bg-orange-950/10'
                      : 'border-zinc-900 bg-black hover:border-zinc-800'
                  }`}
                  onClick={() => document.getElementById('suppliers-file-picker')?.click()}
                >
                  <Upload className="w-8 h-8 text-orange-400 mb-2" />
                  <p className="text-xs text-zinc-300 font-medium">Arrastra tu archivo CSV o JSON aquí</p>
                  <p className="text-[10px] text-zinc-500 font-mono mt-1">o haz clic para explorar en tu equipo</p>
                  <input
                    id="suppliers-file-picker"
                    type="file"
                    accept=".csv,.json"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <div className="h-px bg-zinc-900 flex-1"></div>
                  <span className="text-[10px] text-zinc-650 font-mono uppercase text-zinc-500 font-bold">o pega texto sin formato</span>
                  <div className="h-px bg-zinc-900 flex-1"></div>
                </div>

                {/* Copy/Paste Area */}
                <div className="space-y-2">
                  <textarea
                    rows={4}
                    placeholder="Copia y pega la información de tus proveedores aquí en formato CSV (Ej: RIF, Razón Social, Persona, Teléfono...)"
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    className="w-full p-2.5 bg-black border border-zinc-900 rounded text-[11px] text-zinc-300 font-mono placeholder-zinc-705 focus:outline-none focus:border-orange-550"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={!importText.trim()}
                      onClick={() => {
                        if (importText.trim().startsWith('[')) {
                          handleJSONImport(importText);
                        } else {
                          handleCSVImport(importText);
                        }
                      }}
                      className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition select-none tracking-wider ${
                        importText.trim()
                          ? 'bg-orange-600 text-black hover:bg-orange-500 active:scale-95 cursor-pointer'
                          : 'bg-zinc-900 border border-zinc-850 text-zinc-650 cursor-not-allowed'
                      }`}
                    >
                      Procesar Texto
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Side: Instructions and Export */}
              <div className="space-y-4 bg-black p-4 border border-zinc-900 rounded">
                <div className="space-y-1.5 text-xs text-zinc-350 leading-relaxed">
                  <span className="text-[10px] text-orange-400 uppercase tracking-widest font-mono font-bold block">💡 Columnas Soportadas</span>
                  <p className="text-[11px] text-zinc-400">
                    Las cabeceras de la primera fila admiten español e inglés e identifican inteligentemente a tus distribuidores:
                  </p>
                  <ul className="list-disc list-inside text-[10.5px] text-zinc-400 pl-1 space-y-1">
                    <li><strong>RIF Comercial:</strong> <code className="text-orange-400 bg-zinc-950 px-1 py-0.5 rounded">rif, id, proveedor_rif</code> (Ej. J-12345678)</li>
                    <li><strong>Razón Social:</strong> <code className="text-orange-400 bg-zinc-950 px-1 py-0.5 rounded">nombre, name, razon_social, proveedor</code></li>
                    <li><strong>Persona de Contacto:</strong> <code className="text-orange-400 bg-zinc-950 px-1 py-0.5 rounded">contact, contacto, persona, encargado</code></li>
                    <li><strong>Teléfono:</strong> <code className="text-orange-400 bg-zinc-950 px-1 py-0.5 rounded">telefono, celular, phone</code></li>
                    <li><strong>Correo:</strong> <code className="text-orange-400 bg-zinc-950 px-1 py-0.5 rounded">correo, email, mail</code></li>
                    <li><strong>Dirección:</strong> <code className="text-orange-400 bg-zinc-950 px-1 py-0.5 rounded">direccion, address, fiscal</code></li>
                  </ul>
                </div>

                <div className="pt-3 border-t border-zinc-900 flex flex-col gap-2.5">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono font-bold block">📤 Exportar Datos de Distribuidores</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleExportCSV}
                      className="py-2 px-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-950 rounded text-xs text-zinc-200 hover:text-white font-bold transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-orange-400" /> Exportar CSV
                    </button>
                    <button
                      type="button"
                      onClick={handleExportJSON}
                      className="py-2 px-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-950 rounded text-xs text-zinc-200 hover:text-white font-bold transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-zinc-400" /> Exportar JSON
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* STEP PREVIEW SUPPLIERS */
            <div className="space-y-4 animate-fade-in font-mono">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-black p-3 rounded border border-zinc-900 gap-3">
                <div className="space-y-1">
                  <span className="text-[11px] font-mono font-bold text-orange-400 block flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-orange-400" /> ¡Lectura Finalizada! ({parsedSuppliers.length} proveedores procesados)
                  </span>
                  <p className="text-[10px] text-zinc-400 leading-normal">
                    Revisa los distribuidores detectados antes de sincronizar al almacenamiento local y Firebase.
                  </p>
                </div>

                <div className="flex items-center gap-2 font-mono text-[10px]">
                  <span className="text-zinc-450 font-bold whitespace-nowrap text-zinc-400">Ante duplicados de RIF:</span>
                  <select
                    value={duplicateStrategy}
                    onChange={(e) => setDuplicateStrategy(e.target.value as 'overwrite' | 'skip')}
                    className="bg-zinc-900 border border-zinc-800 p-1.5 rounded text-[10px] text-white focus:outline-none"
                  >
                    <option value="skip">Omitir Duplicado (Ignorar)</option>
                    <option value="overwrite">Sobrescribir Fila Existente (Actualizar)</option>
                  </select>
                </div>
              </div>

              {/* Preview table */}
              <div className="max-h-56 overflow-y-auto border border-zinc-900 rounded bg-black">
                <table className="w-full text-left text-[11px] font-mono border-collapse">
                  <thead className="bg-zinc-900 text-zinc-400 sticky top-0 border-b border-zinc-900">
                    <tr>
                      <th className="p-2 border-r border-zinc-800">R.I.F. Comercial</th>
                      <th className="p-2 border-r border-zinc-800">Nombre o Razón Social</th>
                      <th className="p-2 border-r border-zinc-800">Atención / Contacto</th>
                      <th className="p-2 border-r border-zinc-800">Teléfono</th>
                      <th className="p-2">Correo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900 text-zinc-300">
                    {parsedSuppliers.slice(0, 50).map((s, idx) => {
                      const isDuplicate = suppliers.some(x => x.rif.toUpperCase() === s.rif.toUpperCase());
                      return (
                        <tr key={idx} className={`hover:bg-zinc-900/40 ${isDuplicate ? 'bg-orange-500/5' : ''}`}>
                          <td className="p-2 border-r border-zinc-900 font-bold whitespace-nowrap">
                            {s.rif} {isDuplicate && <span className="text-[8px] bg-amber-500/10 border border-amber-500/25 text-amber-500 px-1 rounded ml-1">Duplicado</span>}
                          </td>
                          <td className="p-2 border-r border-zinc-900 font-sans font-bold">{s.name}</td>
                          <td className="p-2 border-r border-zinc-900 text-zinc-400">{s.contactPerson || '-'}</td>
                          <td className="p-2 border-r border-zinc-900 text-zinc-400">{s.phone || '-'}</td>
                          <td className="p-2 text-zinc-450 truncate max-w-[150px]">{s.email || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-900">
                <button
                  type="button"
                  onClick={() => {
                    setParsedSuppliers([]);
                    setImportStep('upload');
                  }}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-bold rounded transition uppercase select-none tracking-wider"
                >
                  Atrás
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-500 text-black text-xs font-bold rounded transition flex items-center gap-1.5 uppercase select-none tracking-wider"
                >
                  <Check className="w-4 h-4 text-black" /> Grabar Proveedores Importados
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUCCESS BANNER */}
      {successMessage && (
        <div className="bg-orange-500/10 border border-orange-500/20 text-orange-400 p-3 rounded text-xs font-mono flex items-center gap-2 animate-fade-in">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* FILTER BAR */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-4">
        <div className="relative w-full max-w-xl">
          <span className="absolute inset-y-0 left-3 flex items-center text-zinc-500">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Buscar por RIF, nombre del distribuidor, persona de contacto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-black border border-zinc-900 rounded text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 font-mono"
          />
        </div>
      </div>

      {/* SUPPLIERS LISTING TABLE */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-lg overflow-hidden shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-mono">
            <thead>
              <tr className="bg-black/80 border-b border-zinc-900 text-zinc-400 text-[10px] uppercase tracking-wider">
                <th className="p-3.5 pl-4 font-extrabold">R.I.F. Comercial</th>
                <th className="p-3.5 font-extrabold">Razón Social del Proveedor</th>
                <th className="p-3.5 font-extrabold">Persona de Contacto</th>
                <th className="p-3.5 font-extrabold">Contacto Directo</th>
                <th className="p-3.5 font-extrabold">Ubicación y Depósitos</th>
                <th className="p-3.5 text-right pr-4 font-extrabold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900 text-xs">
              {filteredSuppliers.length > 0 ? (
                filteredSuppliers.map(s => (
                  <tr key={s.id} className="hover:bg-zinc-900/30 transition-colors">
                    <td className="p-3.5 pl-4 font-bold text-orange-400 whitespace-nowrap">
                      {s.rif}
                    </td>
                    <td className="p-3.5 text-white font-semibold">
                      {s.name}
                    </td>
                    <td className="p-3.5 text-zinc-300">
                      {s.contactPerson ? (
                        <div className="flex items-center gap-1.5 font-semibold">
                          <UserIcon className="w-3.5 h-3.5 text-orange-500/80" />
                          <span>{s.contactPerson}</span>
                        </div>
                      ) : (
                        <span className="italic text-zinc-500">Solo Corporativo</span>
                      )}
                    </td>
                    <td className="p-3.5 text-zinc-300 space-y-1">
                      {s.phone && (
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <Phone className="w-3 h-3 text-zinc-500" />
                          <span>{s.phone}</span>
                        </div>
                      )}
                      {s.email ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                          <Mail className="w-3 h-3 text-zinc-500 cursor-pointer hover:text-white" title={`Enviar correo a ${s.email}`}>
                            {s.email}
                          </Mail>
                        </div>
                      ) : (
                        !s.phone && <span className="text-zinc-650 italic">Sin datos</span>
                      )}
                    </td>
                    <td className="p-3.5 text-zinc-400 max-w-xs truncate" title={s.address || ''}>
                      {s.address ? (
                        <div className="flex items-center gap-1 text-[11px]">
                          <MapPin className="w-3 h-3 text-zinc-500 shrink-0" />
                          <span className="truncate">{s.address}</span>
                        </div>
                      ) : (
                        <span className="italic text-zinc-550">No registrada</span>
                      )}
                    </td>
                    <td className="p-3.5 text-right pr-4 space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => openEditModal(s)}
                        disabled={!canEdit}
                        className="p-1 px-2.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 disabled:opacity-50 disabled:hover:bg-zinc-900 rounded text-[10px] uppercase font-bold text-white hover:text-orange-400 transition"
                        title="Modificar datos del proveedor"
                      >
                        <Edit2 className="w-3 h-3 inline-block mr-1 -mt-0.5" /> Editar
                      </button>
                      {currentUser.role === 'Administrador' && (
                        <button
                          onClick={() => handleDeleteSupplier(s.id, s.name)}
                          className="p-1 px-2.5 bg-red-950/20 hover:bg-red-900/30 border border-red-900/40 rounded text-[10px] uppercase font-bold text-red-400 hover:text-red-300 transition cursor-pointer"
                          title="Remover distribuidor (Solo Administrador)"
                        >
                          <Trash className="w-3 h-3 inline-block" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-505 italic font-mono text-xs">
                    Ningún proveedor o distribuidor coincide con los filtros de búsqueda establecidos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-55 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-900 w-full max-w-md rounded-lg overflow-hidden shadow-2xl animate-scale-up">
            <div className="p-4 bg-black border-b border-zinc-900 flex justify-between items-center">
              <h3 className="text-xs font-extrabold uppercase font-mono tracking-widest text-orange-400 flex items-center gap-1.5">
                <Briefcase className="w-4 h-4" />
                {editingSupplier ? 'Modificar Datos de Proveedor' : 'Registrar Nuevo Proveedor'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-500 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-5 space-y-4 font-mono text-xs">
              {formError && (
                <div className="bg-red-950/20 border border-red-900/30 text-red-400 p-2.5 rounded text-[11px] leading-normal flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-extrabold text-zinc-400 block mb-1">
                      R.I.F. Comercial *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="J-00012345-0"
                      value={rif}
                      onChange={(e) => setRif(e.target.value)}
                      className="w-full bg-black border border-zinc-900 focus:border-orange-500 rounded py-1.5 px-3 uppercase text-white outline-none animate-fade-in"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-extrabold text-zinc-400 block mb-1">
                      Persona de Contacto
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Carlos Mendoza"
                      value={contactPerson}
                      onChange={(e) => setContactPerson(e.target.value)}
                      className="w-full bg-black border border-zinc-900 focus:border-orange-500 rounded py-1.5 px-3 text-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-extrabold text-zinc-400 block mb-1">
                    Razón Social / Nombre Comercial *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Toho, Prescott, Suministros CIMA"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-black border border-zinc-900 focus:border-orange-500 rounded py-1.5 px-3 text-white outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-extrabold text-zinc-400 block mb-1">
                      Teléfono Directo
                    </label>
                    <input
                      type="text"
                      placeholder="0212-2021111"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-black border border-zinc-900 focus:border-orange-500 rounded py-1.5 px-3 text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-extrabold text-zinc-400 block mb-1">
                      Correo de Ventas
                    </label>
                    <input
                      type="email"
                      placeholder="ventas@proveedor.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-black border border-zinc-900 focus:border-orange-500 rounded py-1.5 px-3 text-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-extrabold text-zinc-400 block mb-1">
                    Dirección u Oficinas Principales
                  </label>
                  <textarea
                    placeholder="Zona Industrial Los Cortijos de Lourdes, Transversal 3..."
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full bg-black border border-zinc-900 focus:border-orange-500 rounded py-1.5 px-3 text-white outline-none resize-none leading-normal"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-900 flex justify-between items-center gap-2">
                {editingSupplier && currentUser.role === 'Administrador' ? (
                  <button
                    type="button"
                    onClick={() => {
                      const id = editingSupplier.id;
                      const name = editingSupplier.name;
                      setIsModalOpen(false);
                      handleDeleteSupplier(id, name);
                    }}
                    className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 text-red-300 hover:text-white rounded text-[11px] font-bold uppercase transition flex items-center gap-1 cursor-pointer shadow"
                    title="Eliminar este distribuidor (Solo Administrador)"
                  >
                    <Trash className="w-3 h-3" /> Eliminar Proveedor
                  </button>
                ) : <div />}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-850 text-white rounded text-[11px] font-bold uppercase transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-orange-600 hover:bg-orange-550 text-black rounded text-[11px] font-extrabold uppercase transition"
                  >
                    {editingSupplier ? 'Guardar Cambios' : 'Registrar Proveedor'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
