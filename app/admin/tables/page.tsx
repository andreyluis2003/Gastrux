'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Button,
  Card,
  Input,
  Label,
  BackButton,
  LoadingSkeleton,
} from '@/components/ui';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Edit2,
  QrCode,
} from 'lucide-react';
import Link from 'next/link';

interface Table {
  id: string;
  number: number;
  capacity: number;
  sectionId: string;
  isAvailable: boolean;
  section: { id: string; name: string };
  reservations: any[];
}

interface TableSection {
  id: string;
  name: string;
  capacity: number;
  tables: Table[];
}

export default function TablesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tables, setTables] = useState<Table[]>([]);
  const [sections, setSections] = useState<TableSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTableDialog, setShowNewTableDialog] = useState(false);
  const [showNewSectionDialog, setShowNewSectionDialog] = useState(false);
  const [newSection, setNewSection] = useState({ name: '', capacity: '' });
  const [newTable, setNewTable] = useState({
    sectionId: '',
    number: '',
    capacity: '',
  });

  useEffect(() => {
    if (status === 'authenticated') {
      fetchTables();
    }
  }, [status]);

  if (status === 'loading') return <LoadingSkeleton count={5} />;
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  const fetchTables = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/tables');
      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      setTables(data.tables);
      setSections(data.sections);
    } catch (error) {
      console.error('Error fetching tables:', error);
      toast.error('Erro ao carregar mesas');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSection = async () => {
    if (!newSection.name || !newSection.capacity) {
      toast.error('Preencha todos os campos');
      return;
    }

    try {
      const response = await fetch('/api/admin/table-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSection),
      });

      if (!response.ok) throw new Error('Failed to create section');

      toast.success('Seção criada com sucesso');
      setNewSection({ name: '', capacity: '' });
      setShowNewSectionDialog(false);
      fetchTables();
    } catch (error) {
      console.error('Error creating section:', error);
      toast.error('Erro ao criar seção');
    }
  };

  const handleCreateTable = async () => {
    if (!newTable.sectionId || !newTable.number || !newTable.capacity) {
      toast.error('Preencha todos os campos');
      return;
    }

    try {
      const response = await fetch('/api/admin/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTable),
      });

      if (!response.ok) throw new Error('Failed to create table');

      toast.success('Mesa criada com sucesso');
      setNewTable({ sectionId: '', number: '', capacity: '' });
      setShowNewTableDialog(false);
      fetchTables();
    } catch (error) {
      console.error('Error creating table:', error);
      toast.error('Erro ao criar mesa');
    }
  };

  const handleDeleteTable = async (id: string) => {
    if (!confirm('Deseja deletar esta mesa?')) return;

    try {
      const response = await fetch(`/api/admin/tables/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete');

      toast.success('Mesa deletada com sucesso');
      fetchTables();
    } catch (error) {
      console.error('Error deleting table:', error);
      toast.error('Erro ao deletar mesa');
    }
  };

  const tablesBySection = sections.map((section) => ({
    ...section,
    tables: tables.filter((t) => t.sectionId === section.id),
  }));

  return (
    <div className="space-y-6 p-4 sm:space-y-6 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold sm:text-3xl">Gerenciar Mesas</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure seções e mesas do seu restaurante
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto flex-wrap">
          <Button
            variant="outline"
            asChild
            className="flex-1 gap-2 sm:flex-none"
          >
            <Link href="/admin/tables/qrcodes">
              <QrCode size={18} />
              QR Codes
            </Link>
          </Button>
          <Button
            onClick={() => setShowNewSectionDialog(true)}
            variant="outline"
            className="flex-1 gap-2 sm:flex-none"
          >
            <Plus size={18} />
            Seção
          </Button>
          <Button
            onClick={() => setShowNewTableDialog(true)}
            className="flex-1 gap-2 sm:flex-none"
          >
            <Plus size={18} />
            Mesa
          </Button>
        </div>
      </div>

      {/* Sections Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <LoadingSkeleton key={i} />
          ))}
        </div>
      ) : tablesBySection.length === 0 ? (
        <Card className="flex h-40 flex-col items-center justify-center p-6">
          <p className="text-muted-foreground">Nenhuma seção cadastrada</p>
          <p className="text-xs text-muted-foreground mt-1">Clique em "+ Seção" para criar a primeira seção de mesas.</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tablesBySection.map((section) => (
            <Card key={section.id} className="p-4">
              <h3 className="mb-3 font-semibold">{section.name}</h3>

              <div className="mb-4 space-y-2 text-sm">
                <p>
                  <strong>Capacidade:</strong> {section.capacity} pessoas
                </p>
                <p>
                  <strong>Mesas:</strong> {section.tables.length}
                </p>
                <p>
                  <strong>Ocupadas:</strong>{' '}
                  {section.tables.filter((t: any) => t.reservations.length > 0).length}
                </p>
              </div>

              {/* Tables in Section */}
              <div className="mb-4 space-y-2">
                {section.tables.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma mesa</p>
                ) : (
                  section.tables.map((table: any) => (
                    <div
                      key={table.id}
                      className={`flex items-center justify-between rounded border p-2 text-xs ${
                        table.isAvailable
                          ? 'border-green-200 bg-green-50'
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div>
                        <span className="font-medium">Mesa {table.number}</span>
                        <span className="ml-2 text-muted-foreground">
                          ({table.capacity} lugares)
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            router.push(`/admin/tables/${table.id}`)
                          }
                          className="h-6 w-6 p-0"
                        >
                          <Edit2 size={12} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTable(table.id)}
                          className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* New Section Dialog */}
      {showNewSectionDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md space-y-4 p-6 sm:w-96">
            <h2 className="text-lg font-bold">Nova Seção</h2>

            <div>
              <Label>Nome da Seção</Label>
              <Input
                placeholder="ex: Hall Principal, Varanda"
                value={newSection.name}
                onChange={(e) =>
                  setNewSection({ ...newSection, name: e.target.value })
                }
                className="mt-2"
              />
            </div>

            <div>
              <Label>Capacidade Total</Label>
              <Input
                type="number"
                placeholder="ex: 50"
                value={newSection.capacity}
                onChange={(e) =>
                  setNewSection({ ...newSection, capacity: e.target.value })
                }
                className="mt-2"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowNewSectionDialog(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button onClick={handleCreateSection} className="flex-1">
                Criar
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* New Table Dialog */}
      {showNewTableDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md space-y-4 p-6 sm:w-96">
            <h2 className="text-lg font-bold">Nova Mesa</h2>

            <div>
              <Label>Seção</Label>
              <select
                value={newTable.sectionId}
                onChange={(e) =>
                  setNewTable({ ...newTable, sectionId: e.target.value })
                }
                className="mt-2 w-full rounded border border-border bg-background px-3 py-2"
              >
                <option value="">Selecione uma seção</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Número da Mesa</Label>
              <Input
                type="number"
                placeholder="ex: 1"
                value={newTable.number}
                onChange={(e) =>
                  setNewTable({ ...newTable, number: e.target.value })
                }
                className="mt-2"
              />
            </div>

            <div>
              <Label>Capacidade</Label>
              <Input
                type="number"
                placeholder="ex: 4"
                value={newTable.capacity}
                onChange={(e) =>
                  setNewTable({ ...newTable, capacity: e.target.value })
                }
                className="mt-2"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowNewTableDialog(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button onClick={handleCreateTable} className="flex-1">
                Criar
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
