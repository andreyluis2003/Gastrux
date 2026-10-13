import Link from 'next/link';
import { GastruxLogo, HelpflowLogo } from '@/components/brand/logo';

/**
 * The footer of the public site (landing, segment pages, plans, calculator): one footer, in the brand
 * colors, signed by Helpflow, the company behind Gastrux (brand kit 2026-10-13).
 */
export function SiteFooter() {
  return (
    <footer className="bg-brand-ink text-brand-light/80 py-12 px-4 sm:px-6 font-brand">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-4 gap-8 mb-10">
          <div className="md:col-span-2">
            <Link href="/" className="inline-block mb-3" aria-label="Gastrux, página inicial">
              <GastruxLogo negative className="h-16 -ml-3" />
            </Link>
            <p className="text-sm leading-relaxed max-w-md">
              A calculadora inteligente do seu restaurante. Sai do caderno, enxerga o custo e a margem de cada prato e toma decisão com segurança.
            </p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Produto</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/#features" className="hover:text-white">Funcionalidades</Link></li>
              <li><Link href="/#como-comecar" className="hover:text-white">Como é a implantação</Link></li>
              <li><Link href="/pricing" className="hover:text-white">Planos</Link></li>
              <li><Link href="/#segmentos" className="hover:text-white">Segmentos</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Suporte</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/ajuda" className="hover:text-white">Central de Ajuda</Link></li>
              <li><Link href="/suporte" className="hover:text-white">Abrir chamado</Link></li>
              <li><a href="mailto:contato@gastrux.com" className="hover:text-white">contato@gastrux.com</a></li>
              <li><Link href="/auth/signin" className="hover:text-white">Entrar</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <p>&copy; 2026 Gastrux. Todos os direitos reservados.</p>
          <div className="flex items-center gap-3">
            <span className="text-xs">Um produto</span>
            <HelpflowLogo negative className="h-11 -ml-2" />
          </div>
        </div>
        <p className="mt-3 text-center sm:text-right text-xs text-brand-light/60">Help Flow Ltda, CNPJ 61.639.918/0001-70</p>
      </div>
    </footer>
  );
}
