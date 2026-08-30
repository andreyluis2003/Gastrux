'use client';

import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { Clock, Calendar, CheckCircle, Truck, Info } from 'lucide-react';

export default function AgendamentoPage() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Clock className="h-6 w-6 text-blue-600" /> Agendamento de Pedidos</h1>
          <p className="text-sm text-gray-500">Pedidos delivery com horário programado</p>
        </div>
      </div>

      <Card className="p-6 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <h2 className="font-bold text-blue-800">Como Funciona</h2>
            <p className="text-sm text-blue-700 mt-1">O agendamento permite que seus clientes escolham data e horário para receber o pedido delivery. O recurso está integrado diretamente no Site Delivery.</p>
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center"><Calendar className="h-6 w-6 text-blue-600" /></div>
            <h3 className="font-bold">1. Cliente Escolhe</h3>
            <p className="text-sm text-gray-500">No checkout do delivery, o cliente seleciona data e horário desejado para entrega.</p>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center"><Truck className="h-6 w-6 text-orange-600" /></div>
            <h3 className="font-bold">2. Pedido Registrado</h3>
            <p className="text-sm text-gray-500">O pedido aparece na Central de Pedidos com o horário agendado destacado.</p>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center"><CheckCircle className="h-6 w-6 text-green-600" /></div>
            <h3 className="font-bold">3. Preparo no Tempo Certo</h3>
            <p className="text-sm text-gray-500">A cozinha é notificada para iniciar o preparo no momento ideal.</p>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="font-bold text-lg mb-4">Regras de Agendamento</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Clock className="h-5 w-5 text-gray-600" />
            <div>
              <p className="font-medium text-sm">Antecedência Mínima</p>
              <p className="text-xs text-gray-500">Pedidos devem ser agendados com pelo menos 1 hora de antecedência</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Calendar className="h-5 w-5 text-gray-600" />
            <div>
              <p className="font-medium text-sm">Prazo Máximo</p>
              <p className="text-xs text-gray-500">Agendamento disponível para até 7 dias à frente</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <CheckCircle className="h-5 w-5 text-gray-600" />
            <div>
              <p className="font-medium text-sm">Horário de Funcionamento</p>
              <p className="text-xs text-gray-500">Clientes só podem agendar dentro do horário configurado do restaurante</p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4 bg-green-50 border-green-200">
        <h3 className="font-bold text-sm text-green-800 mb-2">✅ Status: Ativo</h3>
        <p className="text-sm text-green-700">O agendamento está disponível automaticamente no seu Site Delivery. Clientes podem escolher o horário no momento do checkout.</p>
      </Card>
    </div>
  );
}
