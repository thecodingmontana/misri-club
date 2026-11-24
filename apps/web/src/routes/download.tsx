import { createFileRoute } from '@tanstack/react-router'
import { DocPage } from '#/components/doc-page'
import { GetTheApp } from '#/components/get-the-app'
import { seo } from '#/lib/seo'

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
      <GetTheApp />
      <h2>Installing the APK</h2>
      <ol>
        <li>Download it, then open the file.</li>
        <li>
          When asked, allow your browser to install apps, then tap{' '}
          <strong>Install</strong>.
        </li>
        <li>Open Misri and sign in with your usual account.</li>
      </ol>
      <p>
        A new version is published whenever the app changes, built from the{' '}
        <a href={RELEASES_URL}>open source code on GitHub</a>. The link above is
        always the newest.
      </p>
    </DocPage>
  )
}
