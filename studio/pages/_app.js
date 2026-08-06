import '../styles/globals.css'
import '../src/components/VideoEditor/editor-globals.css'
import Head from 'next/head'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="alternate icon" type="image/png" href="/icon.png" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}
