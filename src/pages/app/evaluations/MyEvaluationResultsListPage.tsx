import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';

export default function MyEvaluationResultsListPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: '/app/evaluations', search: { view: 'results' }, replace: true });
  }, [navigate]);

  return null;
}
