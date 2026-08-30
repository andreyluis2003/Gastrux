/**
 * Componente para pré-carregamento de fontes críticas
 * Reduz Largest Contentful Paint (LCP)
 */
export function FontPreload() {
  return (
    <>
      {/* Poppins (principal) */}
      <link
        rel="preload"
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
        as="style"
      />
      {/* DM Sans (secundária) */}
      <link
        rel="preload"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap"
        as="style"
      />
      {/* Preconnect ao Google Fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    </>
  );
}
