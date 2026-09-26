import { redirect } from 'next/navigation';

/**
 * This older screen treated the list of POS settings as a single object, so it never showed nor
 * saved a configuration, and it pointed card machines at webhook URLs that do not exist.
 * /admin/pdv is the working screen for the same settings.
 */
export default function POSIntegrationPage() {
  redirect('/admin/pdv');
}
