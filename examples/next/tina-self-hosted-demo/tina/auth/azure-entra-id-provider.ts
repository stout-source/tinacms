import { DefaultAuthJSProvider } from 'tinacms-authjs/dist/tinacms';

export const AZURE_ENTRA_ID_AUTH_PROVIDER_NAME = 'azure-ad';

export const isAzureEntraIdAuthEnabled = () =>
  process.env.NEXT_PUBLIC_TINA_AUTH_PROVIDER ===
  AZURE_ENTRA_ID_AUTH_PROVIDER_NAME;

export class AzureEntraIdAuthProvider extends DefaultAuthJSProvider {
  constructor(props?: { callbackUrl?: string; redirect?: boolean }) {
    super({
      ...props,
      name: AZURE_ENTRA_ID_AUTH_PROVIDER_NAME,
    });
  }
}
