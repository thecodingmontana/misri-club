"""What's new in an app release, from the commits since the previous one.

Each feat or fix commit that touched the app gives a line: the "- " lines of
its message when it has them (a squash merge lists its changes there), else
its subject. Prints Markdown for the GitHub Release, which the app shows when
it offers the update.
"""

import re
import subprocess
import sys

since = sys.argv[1] if len(sys.argv) > 1 else ''
paths = ['apps/mobile', 'packages/api-client', 'packages/core']
log = subprocess.run(
    ['git', 'log', '--no-merges', '--format=%x1e%B',
     f'{since}..HEAD' if since else 'HEAD', '--', *paths],
    capture_output=True, text=True, check=True,
).stdout

KIND = re.compile(r'^(feat|fix)(\([^)]*\))?!?: ')
lines = []
for message in log.split('\x1e'):
    message = message.strip()
    if not message:
        continue
    subject, *body = message.splitlines()
    if not KIND.match(subject):
        continue
    bullets = [b[2:].strip() for b in body if b.startswith('- ')]
    for text in bullets or [re.sub(r' \(#\d+\)$', '', KIND.sub('', subject))]:
        line = text[:1].upper() + text[1:]
        if line not in lines:
            lines.append(line)

print("## What's new")
for line in lines[:20] or ['Improvements and fixes.']:
    print(f'- {line}')
print()
print('Install misri.apk on Android (allow installing from your browser when asked).')
