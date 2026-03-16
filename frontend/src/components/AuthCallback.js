import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent double execution in StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processAuth = async () => {
      console.log('🔍 AuthCallback: Starting auth process');
      console.log('🔍 Location hash:', location.hash);
      
      // Extract session_id from URL fragment
      const hash = location.hash;
      const params = new URLSearchParams(hash.replace('#', ''));
      const sessionId = params.get('session_id');

      console.log('🔍 Session ID extracted:', sessionId);

      if (!sessionId) {
        console.error('❌ No session_id found, redirecting to login');
        navigate('/login');
        return;
      }

      try {
        console.log('🔄 Calling backend /auth/session...');
        // Exchange session_id for user data
        const response = await axios.post(
          `${API}/auth/session`,
          { session_id: sessionId },
          { withCredentials: true }
        );

        console.log('✅ Auth successful, user data:', response.data);
        setUser(response.data);
        
        console.log('🔄 Navigating to dashboard...');
        // Redirect to dashboard with user data
        navigate('/dashboard', { state: { user: response.data }, replace: true });
      } catch (error) {
        console.error('❌ Auth failed:', error);
        console.error('❌ Error details:', error.response?.data || error.message);
        alert(`Erro na autenticação: ${error.response?.data?.detail || error.message}`);
        navigate('/login');
      }
    };

    processAuth();
  }, [location, navigate, setUser]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
        <p className="text-zinc-400">Autenticando...</p>
      </div>
    </div>
  );
};

export default AuthCallback;