import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Landmark, Loader2, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://api.sigcr.com.br';
const API = `${BACKEND_URL}/api`;

const Estados = () => {
  const { user, initialized, isAdmin, isDetran } = useAuth();
  const navigate = useNavigate();
  const [estados, setEstados] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!initialized || !user) return;
    // detran/detran_admin só têm um estado — pula direto pra ele
    if (isDetran && !isAdmin && user.detran_uf) {
      navigate(`/estados/${user.detran_uf}`, { replace: true });
      return;
    }
    fetchEstados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, user]);

  const fetchEstados = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/estados`, { withCredentials: true });
      setEstados(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Erro ao carregar estados:', error);
      toast.error('Erro ao carregar estados');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Landmark className="h-6 w-6 text-primary-400" />
            Estados
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Acompanhamento de credenciamento, portarias e documentos por UF
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500 gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
            <span>Carregando estados...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {estados.map((estado) => (
              <Card
                key={estado.sigla}
                className="bg-zinc-900/50 border-zinc-800 hover:border-primary-500/30 transition-colors cursor-pointer"
                onClick={() => navigate(`/estados/${estado.sigla}`)}
              >
                <CardContent className="p-5 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-primary-400">{estado.sigla}</span>
                      <span className="text-white font-medium">{estado.nome}</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Badge className={estado.configurado
                        ? 'bg-green-500/10 text-green-400 border-green-500/20 text-xs'
                        : 'bg-zinc-800 text-zinc-500 border-zinc-700 text-xs'}>
                        {estado.configurado ? 'Ativado' : 'Não ativado'}
                      </Badge>
                      <span className="text-xs text-zinc-500 self-center">
                        {estado.empresas_credenciadas_count} empresa(s) credenciada(s)
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-zinc-600 shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Estados;
