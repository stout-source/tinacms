import { DefaultAuthJSProvider } from 'tinacms-authjs/dist/tinacms';

export const AZURE_ENTRA_ID_AUTH_PROVIDER_NAME = 'azure-ad';

export class AzureEntraIdAuthProvider extends DefaultAuthJSProvider {
  constructor(props?: { callbackUrl?: string; redirect?: boolean }) {
    super({
      ...props,
      name: AZURE_ENTRA_ID_AUTH_PROVIDER_NAME,
    });
  }
}
