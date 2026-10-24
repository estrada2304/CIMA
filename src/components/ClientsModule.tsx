import React, { useState } from 'react';
import { 
  Users, Search, Plus, Trash, Edit2, CheckCircle, AlertCircle, X, MapPin, Mail, Phone, FileText,
  Upload, Download, Check, FileSpreadsheet
} from 'lucide-react';
import { Client } from '../types';

interface ClientsModuleProps {
  clients: Client[];
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
  currentUser: { role: string };
}

export default function ClientsModule({
  clients,
  setClients,
  currentUser
}: ClientsModuleProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  // Import / Export state variables
  const [showImportExport, setShowImportExport] = useState(false);
  const [importText, setImportText] = useState('');
  const [parsedClients, setParsedClients] = useState<Client[]>([]);
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

  // Fuzzy column detector and CSV parser for clients
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

      const rifIndex = findIndex(['rif', 'cedula', 'cédula', 'identificacion', 'id', 'rif/ci', 'rif_ci', 'dni']);
      const nameIndex = findIndex(['name', 'nombre', 'razon', 'razón', 'cliente', 'razon_social']);
      const phoneIndex = findIndex(['phone', 'telefono', 'teléfono', 'celular', 'contacto']);
      const emailIndex = findIndex(['email', 'correo', 'mail', 'contacto_correo']);
      const addressIndex = findIndex(['address', 'direccion', 'dirección', 'fiscal']);

      if (nameIndex === -1) {
        throw new Error("No se pudo detectar la columna con el NOMBRE del cliente. Verifique sus cabeceras.");
      }

      const list: Client[] = [];
      const logs: string[] = [];

      for (let i = 1; i < rawLines.length; i++) {
        const line = rawLines[i];
        if (line.length === 0 || (line.length === 1 && line[0] === '')) continue;

        let rawRif = rifIndex !== -1 && line[rifIndex] ? line[rifIndex].replace(/['"\s-]/g, '').toUpperCase() : '';
        if (!rawRif) {
          rawRif = "CLI-" + Math.floor(Math.random() * 900000 + 100000);
        } else {
          // Normalize to common CI/RIF formats: if it is only numeric, prefix V-
          if (/^\d+$/.test(rawRif)) {
            rawRif = "V-" + rawRif;
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

        list.push({
          id: 'cli-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          name,
          rif: rawRif,
          phone,
          email,
          address
        });
      }

      setParsedClients(list);
      setImportLogs(logs);
      setImportStep('preview');
    } catch (err: any) {
      setImportError(err.message || "Error al procesar el archivo CSV.");
    }
  };

  // JSON parser 
  const handleJSONImport = (text: string) => {
    try {
      setImportError(null);
      setImportLogs([]);
      const data = JSON.parse(text);
      const rawList = Array.isArray(data) ? data : (data.clients || []);
      if (!Array.isArray(rawList)) {
        throw new Error("Formato JSON inválido. Debe ser una lista [] de clientes.");
      }

      const list: Client[] = [];
      const logs: string[] = [];

      rawList.forEach((item: any, idx: number) => {
        const name = item.name || item.nombre || '';
        if (!name) {
          logs.push(`Registro en posición ${idx + 1}: Omitido por no tener nombre válido.`);
          return;
        }
        let rawRif = item.rif || item.cedula || item.rif_ci || item.dni || ("CLI-" + Math.floor(Math.random() * 900000 + 100000));
        if (/^\d+$/.test(String(rawRif))) {
          rawRif = "V-" + rawRif;
        }

        list.push({
          id: item.id || ('cli-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
          name: String(name),
          rif: String(rawRif).toUpperCase(),
          phone: item.phone || item.telefono ? String(item.phone || item.telefono) : undefined,
          email: item.email || item.correo ? String(item.email || item.correo) : undefined,
          address: item.address || item.direccion ? String(item.address || item.direccion) : undefined
        });
      });

      setParsedClients(list);
      setImportLogs(logs);
      setImportStep('preview');
    } catch (err: any) {
      setImportError("Error al analizar archivo JSON: " + err.message);
    }
  };

  // Drag and drop handlers
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
    let updatedList = [...clients];
    let overwroteCount = 0;
    let addedCount = 0;
    let skippedCount = 0;

    parsedClients.forEach(c => {
      // Find matching rif
      const existingIdx = updatedList.findIndex(x => x.rif.toUpperCase() === c.rif.toUpperCase());
      if (existingIdx !== -1) {
        if (duplicateStrategy === 'overwrite') {
          updatedList[existingIdx] = {
            ...updatedList[existingIdx],
            ...c,
            id: updatedList[existingIdx].id // Keep the same relative internal id
          };
          overwroteCount++;
        } else {
          skippedCount++;
        }
      } else {
        updatedList.push(c);
        addedCount++;
      }
    });

    setClients(updatedList);
    localStorage.setItem('siga_clients', JSON.stringify(updatedList));

    alert(`✅ Importación de clientes completada con éxito:\n- ${addedCount} clientes nuevos añadidos.\n- ${overwroteCount} actualizados/sobrescritos.\n- ${skippedCount} omitidos por cédula/RIF duplicado.`);
    
    // Clear and reset
    setParsedClients([]);
    setImportText('');
    setImportStep('upload');
    setShowImportExport(false);
  };

  // Export current list to CSV
  const handleExportCSV = () => {
    const headers = ["Cédula / RIF", "Razón Social o Nombre", "Teléfono", "Correo Electrónico", "Dirección Fiscal"];
    const rows = clients.map(c => [
      `"${c.rif}"`,
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.phone || ''}"`,
      `"${c.email || ''}"`,
      `"${(c.address || '').replace(/"/g, '""')}"`
    ]);

    const bom = '\uFEFF';
    const csvContent = bom + headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `SigaInvent_Clientes_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to JSON 
  const handleExportJSON = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(clients, null, 2))}`;
    const link = document.createElement("a");
    link.setAttribute("href", jsonString);
    link.setAttribute("download", `SigaInvent_Clientes_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Form Fields
  const [name, setName] = useState('');
  const [rif, setRif] = useState('V-');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const canEdit = currentUser.role === 'Administrador' || currentUser.role === 'Vendedor';

  // Search filter and alphabetical sorting (A-Z)
  const filteredClients = [...clients]
    .filter(c => {
      if (!c) return false;
      const term = (searchTerm || '').toLowerCase().trim();
      if (!term) return true;
      return (
        (c.name || '').toLowerCase().includes(term) ||
        (c.rif || '').toLowerCase().includes(term) ||
        (c.phone && c.phone.includes(term)) ||
        (c.email && c.email.toLowerCase().includes(term))
      );
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));

  const openAddModal = () => {
    setEditingClient(null);
    setName('');
    setRif('V-');
    setPhone('');
    setEmail('');
    setAddress('');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setName(client.name);
    setRif(client.rif);
    setPhone(client.phone || '');
    setEmail(client.email || '');
    setAddress(client.address || '');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSaveClient = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('El nombre o razón social es obligatorio.');
      return;
    }

    if (!rif.trim() || rif.trim() === 'V-' || rif.trim() === 'J-') {
      setFormError('El RIF o Cédula de Identidad es obligatorio.');
      return;
    }

    // Format RIF to uppercase
    const formattedRif = rif.trim().toUpperCase();

    // Check duplicate RIF (only when adding, or modifying to a DIFFERENT rif)
    const duplicate = clients.find(c => c.rif.toUpperCase() === formattedRif && (!editingClient || c.id !== editingClient.id));
    if (duplicate) {
      setFormError(`Ya existe un cliente registrado con el RIF ${formattedRif} (${duplicate.name}).`);
      return;
    }

    if (editingClient) {
      // Modify
      const updatedClients = clients.map(c => {
        if (c.id === editingClient.id) {
          return {
            ...c,
            name: name.trim(),
            rif: formattedRif,
            phone: phone.trim() || undefined,
            email: email.trim() || undefined,
            address: address.trim() || undefined
          };
        }
        return c;
      });
      setClients(updatedClients);
      setSuccessMessage('Cliente actualizado con éxito.');
    } else {
      // Create new
      const newClient: Client = {
        id: 'cli-' + Date.now(),
        name: name.trim(),
        rif: formattedRif,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined
      };
      setClients([newClient, ...clients]);
      setSuccessMessage('Cliente registrado con éxito.');
    }

    setIsModalOpen(false);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleDeleteClient = (id: string, name: string) => {
    if (currentUser.role !== 'Administrador') {
      alert('⛔ Permiso Denegado: Solo los usuarios con rol de Administrador tienen autorización para eliminar clientes.');
      return;
    }
    if (confirm(`¿Está seguro de que desea eliminar al cliente "${name}" del sistema CIMA? Esta acción es irreversible.`)) {
      setClients(clients.filter(c => c.id !== id));
      setSuccessMessage('Cliente eliminado con éxito.');
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* HEADER BANNER */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono text-orange-400 uppercase tracking-widest block font-bold">MÓDULO DE CLIENTES</span>
          <h2 className="text-xl font-bold font-mono tracking-wider text-white mt-1">Directorio de Clientes de Facturación</h2>
          <p className="text-xs text-zinc-400 mt-1 select-none">
            Registre, modifique y consulte las fichas de clientes para la emisión instantánea de facturas, cotizaciones y recibos fiscales.
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
              <Plus className="w-4 h-4" /> Registrar Cliente
            </button>
          )}
        </div>
      </div>

      {/* Import / Export dashboard panel */}
      {showImportExport && (
        <div className="p-5 bg-zinc-950 border border-zinc-900 rounded-lg space-y-5 shadow-xl animate-slide-in">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-zinc-900 pb-3 gap-2">
            <div>
              <h3 className="font-bold text-white text-xs uppercase tracking-wider font-mono text-orange-455 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-orange-400" /> Importación & Exportación de Clientes
              </h3>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Soporta archivos Excel CSV delimitados por comas o archivos JSON estructurados de directorio.</p>
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
                  onClick={() => document.getElementById('clients-file-picker')?.click()}
                >
                  <Upload className="w-8 h-8 text-orange-400 mb-2" />
                  <p className="text-xs text-zinc-300 font-medium">Arrastra tu archivo CSV o JSON aquí</p>
                  <p className="text-[10px] text-zinc-500 font-mono mt-1">o haz clic para explorar en tu equipo</p>
                  <input
                    id="clients-file-picker"
                    type="file"
                    accept=".csv,.json"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <div className="h-px bg-zinc-900 flex-1"></div>
                  <span className="text-[10px] text-zinc-650 font-mono uppercase text-zinc-500">o pega texto sin formato</span>
                  <div className="h-px bg-zinc-900 flex-1"></div>
                </div>

                {/* Copy/Paste Area */}
                <div className="space-y-2">
                  <textarea
                    rows={4}
                    placeholder="Copia y pega la información de contactos de clientes aquí en formato CSV (Ej: Cédula/RIF, Nombre, Teléfono...)"
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
                          : 'bg-zinc-900 border border-zinc-850 text-zinc-600 cursor-not-allowed'
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
                    Las cabeceras de la primera fila pueden venir en español o inglés y son detectadas inteligentemente:
                  </p>
                  <ul className="list-disc list-inside text-[10.5px] text-zinc-400 pl-1 space-y-1">
                    <li><strong>Cédula / RIF:</strong> <code className="text-orange-400 bg-zinc-950 px-1 py-0.5 rounded">rif, cedula, dni, id</code> (Ej. V-25123456)</li>
                    <li><strong>Nombre / Razón Social:</strong> <code className="text-orange-400 bg-zinc-950 px-1 py-0.5 rounded">nombre, name, razon_social</code></li>
                    <li><strong>Teléfono:</strong> <code className="text-orange-400 bg-zinc-950 px-1 py-0.5 rounded">telefono, celular, phone</code></li>
                    <li><strong>Correo:</strong> <code className="text-orange-400 bg-zinc-950 px-1 py-0.5 rounded">correo, email, mail</code></li>
                    <li><strong>Dirección:</strong> <code className="text-orange-400 bg-zinc-950 px-1 py-0.5 rounded">direccion, address, fiscal</code></li>
                  </ul>
                </div>

                <div className="pt-3 border-t border-zinc-900 flex flex-col gap-2.5">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono font-bold block">📤 Exportar Datos del Directorio</span>
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
            /* STEP PREVIEW CLIENTS */
            <div className="space-y-4 animate-fade-in font-mono">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-black p-3 rounded border border-zinc-900 gap-3">
                <div className="space-y-1">
                  <span className="text-[11px] font-mono font-bold text-orange-400 block flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-orange-400" /> ¡Lectura Finalizada! ({parsedClients.length} clientes procesados)
                  </span>
                  <p className="text-[10px] text-zinc-400 leading-normal">
                    Revisa los clientes detectados antes de sincronizar al almacenamiento local y Firebase.
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
                      <th className="p-2 border-r border-zinc-800">Cédula / RIF</th>
                      <th className="p-2 border-r border-zinc-800">Nombre / Razón Social</th>
                      <th className="p-2 border-r border-zinc-800">Teléfono</th>
                      <th className="p-2 border-r border-zinc-800">Correo</th>
                      <th className="p-2">Dirección</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900 text-zinc-300">
                    {parsedClients.slice(0, 50).map((c, idx) => {
                      const isDuplicate = clients.some(x => x.rif.toUpperCase() === c.rif.toUpperCase());
                      return (
                        <tr key={idx} className={`hover:bg-zinc-900/40 ${isDuplicate ? 'bg-orange-500/5' : ''}`}>
                          <td className="p-2 border-r border-zinc-900 font-bold whitespace-nowrap">
                            {c.rif} {isDuplicate && <span className="text-[8px] bg-amber-500/10 border border-amber-500/25 text-amber-500 px-1 rounded ml-1">Duplicado</span>}
                          </td>
                          <td className="p-2 border-r border-zinc-900 font-sans font-bold">{c.name}</td>
                          <td className="p-2 border-r border-zinc-900 text-zinc-400">{c.phone || '-'}</td>
                          <td className="p-2 border-r border-zinc-900 text-zinc-450">{c.email || '-'}</td>
                          <td className="p-2 text-zinc-400 truncate max-w-[150px]">{c.address || '-'}</td>
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
                    setParsedClients([]);
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
                  <Check className="w-4 h-4 text-black" /> Grabar Clientes Importados
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
            placeholder="Buscar por cédula / RIF, nombre o correo del cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-black border border-zinc-900 rounded text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 font-mono"
          />
        </div>
      </div>

      {/* CLIENTS TABLE */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-lg overflow-hidden shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-mono">
            <thead>
              <tr className="bg-black/80 border-b border-zinc-900 text-zinc-400 text-[10px] uppercase tracking-wider">
                <th className="p-3.5 pl-4 font-extrabold">Cédula / RIF</th>
                <th className="p-3.5 font-extrabold flex items-center gap-1.5 text-orange-350">
                  <span>Nombre o Razón Social</span>
                  <span className="text-[9px] bg-orange-950/60 border border-orange-500/30 text-orange-300 px-1 py-0.2 rounded">A-Z</span>
                </th>
                <th className="p-3.5 font-extrabold">Contacto</th>
                <th className="p-3.5 font-extrabold">Dirección Fiscal</th>
                <th className="p-3.5 text-right pr-4 font-extrabold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900 text-xs">
              {filteredClients.length > 0 ? (
                filteredClients.map(c => (
                  <tr key={c.id} className="hover:bg-zinc-900/30 transition-colors">
                    <td className="p-3.5 pl-4 font-bold text-orange-400 whitespace-nowrap">
                      {c.rif}
                    </td>
                    <td className="p-3.5 text-white font-semibold">
                      {c.name}
                    </td>
                    <td className="p-3.5 text-zinc-300 space-y-1">
                      {c.phone && (
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <Phone className="w-3 h-3 text-zinc-500" />
                          <span>{c.phone}</span>
                        </div>
                      )}
                      {c.email ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                          <Mail className="w-3 h-3 text-zinc-500" />
                          <span>{c.email}</span>
                        </div>
                      ) : (
                        !c.phone && <span className="text-zinc-650 italic">Sin datos</span>
                      )}
                    </td>
                    <td className="p-3.5 text-zinc-400 max-w-xs truncate" title={c.address || ''}>
                      {c.address ? (
                        <div className="flex items-center gap-1 text-[11px]">
                          <MapPin className="w-3 h-3 text-zinc-500 shrink-0" />
                          <span className="truncate">{c.address}</span>
                        </div>
                      ) : (
                        <span className="italic text-zinc-650">No registrada</span>
                      )}
                    </td>
                    <td className="p-3.5 text-right pr-4 space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => openEditModal(c)}
                        disabled={!canEdit}
                        className="p-1 px-2.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 disabled:opacity-50 disabled:hover:bg-zinc-900 rounded text-[10px] uppercase font-bold text-white hover:text-orange-400 transition"
                        title="Modificar ficha de cliente"
                      >
                        <Edit2 className="w-3 h-3 inline-block mr-1 -mt-0.5" /> Editar
                      </button>
                      {currentUser.role === 'Administrador' && (
                        <button
                          onClick={() => handleDeleteClient(c.id, c.name)}
                          className="p-1 px-2.5 bg-red-950/20 hover:bg-red-900/30 border border-red-900/40 rounded text-[10px] uppercase font-bold text-red-400 hover:text-red-300 transition cursor-pointer"
                          title="Eliminar cliente de la base de datos (Solo Administrador)"
                        >
                          <Trash className="w-3 h-3 inline-block" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-zinc-505 italic font-mono text-xs">
                    Ningún cliente coincide con los criterios de búsqueda.
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
                <Users className="w-4 h-4" />
                {editingClient ? 'Modificar Ficha de Cliente' : 'Registrar Nuevo Cliente'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-500 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveClient} className="p-5 space-y-4 font-mono text-xs">
              {formError && (
                <div className="bg-red-950/20 border border-red-900/30 text-red-400 p-2.5 rounded text-[11px] leading-normal flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-3.5">
                <div>
                  <label className="text-[10px] uppercase font-extrabold text-zinc-400 block mb-1">
                    Cédula o RIF del Cliente *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="V-12345678-9 o J-30123456-7"
                    value={rif}
                    onChange={(e) => setRif(e.target.value)}
                    className="w-full bg-black border border-zinc-900 focus:border-orange-500 rounded py-1.5 px-3 uppercase text-white outline-none"
                  />
                  <span className="text-[9px] text-zinc-500 block mt-0.5">Incluya guión y dígito verificador. Ej: J-30123456-7</span>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-extrabold text-zinc-400 block mb-1">
                    Nombre Completo o Razón Social *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Simon Guillen, FIBER CONNECTION, C.A."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-black border border-zinc-900 focus:border-orange-500 rounded py-1.5 px-3 text-white outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-extrabold text-zinc-400 block mb-1">
                      Teléfono de Contacto
                    </label>
                    <input
                      type="text"
                      placeholder="0412-1234567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-black border border-zinc-900 focus:border-orange-500 rounded py-1.5 px-3 text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-extrabold text-zinc-400 block mb-1">
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      placeholder="contacto@empresa.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-black border border-zinc-900 focus:border-orange-500 rounded py-1.5 px-3 text-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-extrabold text-zinc-400 block mb-1">
                    Dirección Fiscal Completa
                  </label>
                  <textarea
                    placeholder="Av. Francisco de Miranda, Edificio Centro Plaza, Piso 12..."
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full bg-black border border-zinc-900 focus:border-orange-500 rounded py-1.5 px-3 text-white outline-none resize-none leading-normal"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-900 flex justify-between items-center gap-2">
                {editingClient && currentUser.role === 'Administrador' ? (
                  <button
                    type="button"
                    onClick={() => {
                      const id = editingClient.id;
                      const name = editingClient.name;
                      setIsModalOpen(false);
                      handleDeleteClient(id, name);
                    }}
                    className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 text-red-300 hover:text-white rounded text-[11px] font-bold uppercase transition flex items-center gap-1 cursor-pointer shadow"
                    title="Eliminar este cliente (Solo Administrador)"
                  >
                    <Trash className="w-3 h-3" /> Eliminar Cliente
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
                    Guardar Ficha
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
