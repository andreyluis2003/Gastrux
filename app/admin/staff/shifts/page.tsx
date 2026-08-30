// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { Calendar, Clock, Plus, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

interface Shift {
  id: string;
  staffMemberId: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  shiftType: string;
  isWorked: boolean;
  notes?: string;
  staffMember: { user: { name: string; email: string } };
}

const SHIFT_TYPES: Record<string, { label: string; color: string }> = {
  NORMAL: { label: 'Normal', color: 'bg-blue-100 text-blue-700' },
  EXTENDED: { label: 'Estendido', color: 'bg-orange-100 text-orange-700' },
  REDUCED: { label: 'Reduzido', color: 'bg-green-100 text-green-700' },
  OFF_DAY: { label: 'Folga', color: 'bg-gray-100 text-gray-600' },
  HOLIDAY: { label: 'Feriado', color: 'bg-purple-100 text-purple-700' },
};

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ staffMemberId: '', shiftDate: '', startTime: '08:00', endTime: '18:00', shiftType: 'NORMAL', notes: '' });

  const getWeekRange = (offset: number) => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay() + 1 + offset * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  };

  const fetchData = async () => {
    setLoading(true);
    const { start, end } = getWeekRange(weekOffset);
    try {
      const [shiftsRes, membersRes] = await Promise.all([
        fetch(`/api/admin/staff/shifts?start=${start.toISOString()}&end=${end.toISOString()}`),
        fetch('/api/admin/staff'),
      ]);
      const shiftsData = await shiftsRes.json();
      const membersData = await membersRes.json();
      setShifts(shiftsData.shifts || []);
      setMembers((membersData.members || []).filter((m: any) => m.status === 'ACTIVE'));
    } catch { toast.error('Erro ao carregar turnos'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [weekOffset]);

  const handleSaveShift = async () => {
    if (!form.staffMemberId || !form.shiftDate) { toast.error('Selecione funcionário e data'); return; }
    try {
      const res = await fetch('/api/admin/staff/shifts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast.success('Turno salvo!');
      setShowForm(false);
      fetchData();
    } catch { toast.error('Erro ao salvar turno'); }
  };

  const { start, end } = getWeekRange(weekOffset);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });

  const formatDay = (d: Date) => d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <BackButton />
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2 mt-1">
            <Calendar className="h-7 w-7 text-blue-600" />
            Turnos da Semana
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium">
            {start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - {end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </span>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4 mr-1" /> Turno
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="p-4 space-y-3 border-blue-200 bg-blue-50/50">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-gray-600 block mb-1">Funcionário</label>
              <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.staffMemberId} onChange={(e) => setForm({ ...form, staffMemberId: e.target.value })}>
                <option value="">Selecione</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.user.name}</option>)}
              </select>
            </div>
            <div><label className="text-xs text-gray-600 block mb-1">Data</label><Input type="date" value={form.shiftDate} onChange={(e) => setForm({ ...form, shiftDate: e.target.value })} /></div>
            <div><label className="text-xs text-gray-600 block mb-1">Entrada</label><Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div>
            <div><label className="text-xs text-gray-600 block mb-1">Saída</label><Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Tipo</label>
              <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.shiftType} onChange={(e) => setForm({ ...form, shiftType: e.target.value })}>
                {Object.entries(SHIFT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleSaveShift} className="w-full">Salvar</Button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-3 font-semibold">Funcionário</th>
                {weekDays.map(d => (
                  <th key={d.toISOString()} className="p-3 text-center font-semibold text-xs">
                    {formatDay(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr><td colSpan={8} className="text-center p-8 text-gray-400">Nenhum funcionário ativo</td></tr>
              ) : (
                members.map(member => (
                  <tr key={member.id} className="border-t">
                    <td className="p-3 font-medium">{member.user.name}</td>
                    {weekDays.map(day => {
                      const dayStr = day.toISOString().split('T')[0];
                      const shift = shifts.find(s => s.staffMemberId === member.id && s.shiftDate?.startsWith(dayStr));
                      const st = shift ? (SHIFT_TYPES[shift.shiftType] || SHIFT_TYPES.NORMAL) : null;
                      return (
                        <td key={dayStr} className="p-2 text-center">
                          {shift ? (
                            <div className="space-y-1">
                              <Badge className={st?.color || 'bg-gray-100'}>{st?.label}</Badge>
                              <p className="text-xs text-gray-500">{shift.startTime}-{shift.endTime}</p>
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
