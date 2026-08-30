import { getApiDocs } from '@/lib/swagger';
import ReactSwaggerUI from './swagger-ui';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'API Documentation - Gastrux',
  description: 'Documentação interativa da API REST',
};

export default async function DocsPage() {
  const spec = await getApiDocs();
  return (
    <div className="min-h-screen bg-white">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold">API Documentation</h1>
          <p className="mt-2 text-indigo-100">
            Documentação interativa da API REST do Gastrux
          </p>
        </div>
      </div>
      <ReactSwaggerUI spec={spec} />
    </div>
  );
}
