import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary capturou um crash:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
          <div className="text-center space-y-4 max-w-md px-6">
            <AlertTriangle className="h-10 w-10 text-primary-500 mx-auto" />
            <p className="text-zinc-200 text-sm font-medium">Ocorreu um erro ao carregar esta tela.</p>
            <p className="text-zinc-500 text-xs">Isso não afeta seus dados. Tente voltar ao dashboard.</p>
            <Button onClick={this.handleReload}>
              Voltar ao Dashboard
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
