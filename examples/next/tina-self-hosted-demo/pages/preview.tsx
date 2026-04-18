import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useTina } from 'tinacms/dist/react';
import { Layout } from '../components/layout';
import { Blocks } from '../components/blocks-renderer';
import databaseClient from '../tina/__generated__/databaseClient';

export default function PreviewPage(
  props: AsyncReturnType<typeof getServerSideProps>['props']
) {
  const router = useRouter();
  const { branch } = router.query;
  const [previewBranch, setPreviewBranch] = useState<string | null>(null);

  useEffect(() => {
    // Set preview branch from router once it's ready
    if (branch && typeof branch === 'string') {
      setPreviewBranch(branch);
    }
  }, [branch]);

  // If data fetch failed or no props, show error state
  if (!props || !props.data) {
    return (
      <div style={styles.container}>
        <div style={styles.errorBox}>
          <h1>Preview Not Available</h1>
          {previewBranch && (
            <p>Could not load content from branch: <code>{previewBranch}</code></p>
          )}
          <p>
            <a href="/" style={styles.link}>
              ← Back to Home
            </a>
          </p>
        </div>
      </div>
    );
  }

  const { data } = useTina({
    query: props.query,
    variables: props.variables,
    data: props.data,
  });

  return (
    <div>
      {previewBranch && (
        <div style={styles.previewBanner}>
          <span>
            Previewing from branch: <strong>{previewBranch}</strong>
          </span>
          <a href="/" style={styles.closeBanner}>
            ✕
          </a>
        </div>
      )}
      <Layout rawData={data} data={data.global as any}>
        <Blocks {...data.page} />
      </Layout>
    </div>
  );
}

export const getServerSideProps = async ({ query, req, res }) => {
  try {
    // The x-branch cookie is already set by the /api/preview endpoint
    // The databaseClient will use it to fetch from the correct branch
    
    // Default to home page if no slug provided
    const slug = query.slug ? String(query.slug).replace(/^\//, '') : 'home';

    const tinaProps = await databaseClient.queries.contentQuery({
      relativePath: `${slug}.md`,
    });

    return {
      props: {
        data: tinaProps.data,
        query: tinaProps.query,
        variables: tinaProps.variables,
      },
      revalidate: 60, // ISR: revalidate every 60 seconds
    };
  } catch (error) {
    console.error('Preview page error:', error);
    
    // Return empty props to trigger error state in component
    return {
      props: {
        data: null,
        query: null,
        variables: null,
      },
      revalidate: 10,
    };
  }
};

export type AsyncReturnType<T extends (...args: any) => Promise<any>> = T extends (
  ...args: any
) => Promise<infer R>
  ? R
  : any;

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '2rem',
    backgroundColor: '#f5f5f5',
  },
  errorBox: {
    backgroundColor: 'white',
    padding: '2rem',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    maxWidth: '600px',
    textAlign: 'center' as const,
  },
  link: {
    color: '#0066cc',
    textDecoration: 'none',
    fontWeight: 'bold',
  },
  previewBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderBottom: '2px solid #f59e0b',
    padding: '0.75rem 1.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
  },
  closeBanner: {
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '1.5rem',
    cursor: 'pointer',
    color: '#d97706',
    padding: '0',
    marginLeft: '1rem',
  },
};
