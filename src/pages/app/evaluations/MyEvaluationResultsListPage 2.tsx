import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';

export default function MyEvaluationResultsListPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: '/app/evaluations', replace: true });
  }, [navigate]);

  return null;
}
