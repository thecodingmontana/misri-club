import { createFileRoute, Link } from '@tanstack/react-router'
import { DocPage } from '#/components/doc-page'
import { seo } from '#/lib/seo'

const APK_URL =
  'https://github.com/thecodingmontana/misri-club/releases/latest/download/misri.apk'
const RELEASES_URL = 'https://github.com/thecodingmontana/misri-club/releases'

export const Route = createFileRoute('/download')({
  head: () =>
    seo({
      title: 'Get the app',
      description:
        'Download the Misri app for Android, or install Misri from your browser.',
      path: '/download',
    }),
  component: Download,
})

function Download() {
  return (
    <DocPage title="Get the app" updated="24 November 2026">
      <h2>Android</h2>
      <p>
        <a href={APK_URL}>Download misri.apk</a>. It isn't on the Play Store
        yet, so your phone will ask before installing it:
      </p>
      <ol>
        <li>Open the downloaded file.</li>
        <li>
          When asked, allow your browser to install apps, then tap{' '}
          <strong>Install</strong>.
        </li>
        <li>Open Misri and sign in with your usual account.</li>
      </ol>
      <p>
        Each version is built from the{' '}
        <a href={RELEASES_URL}>open source code on GitHub</a>, where every
        release is listed.
      </p>

      <h2>iPhone and computers</h2>
      <p>
        Install the website as an app: in Safari, tap Share, then{' '}
        <strong>Add to Home Screen</strong>; in Chrome or Edge, use{' '}
        <strong>Install</strong> in the address bar. It works offline too.{' '}
        <Link to="/">Open Misri</Link>.
      </p>
    </DocPage>
  )
}
