import r from 'request';
import md5 from 'md5';
import fs from 'fs';
import path from 'path';
import shell from 'shelljs';

const URL = 'https://platform.joinposter.com/api/application.uploadPOSPlatformBundle?format=json';
const FILENAME = 'bundle.js';
const DEFAULT_MANIFEST_PATH = path.resolve('./manifest.json');
const LOCAL_MANIFEST_PATH = path.resolve('./manifest.local.json');

const readJsonFile = (filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');

    return JSON.parse(content);
  } catch (error) {
    return null;
  }
};

const hasCredentials = manifestConfig => manifestConfig
  && String(manifestConfig.applicationId || '').trim()
  && String(manifestConfig.applicationSecret || '').trim();

const resolveManifest = () => {
  if (process.env.POSTER_APPLICATION_ID && process.env.POSTER_APPLICATION_SECRET) {
    return {
      applicationId: String(process.env.POSTER_APPLICATION_ID).trim(),
      applicationSecret: String(process.env.POSTER_APPLICATION_SECRET).trim(),
      source: 'environment variables',
    };
  }

  const localManifest = readJsonFile(LOCAL_MANIFEST_PATH);

  if (hasCredentials(localManifest)) {
    return {
      ...localManifest,
      source: 'manifest.local.json',
    };
  }

  const defaultManifest = readJsonFile(DEFAULT_MANIFEST_PATH);

  if (hasCredentials(defaultManifest)) {
    return {
      ...defaultManifest,
      source: 'manifest.json',
    };
  }

  throw new Error(
    'Poster credentials are missing. Set POSTER_APPLICATION_ID and POSTER_APPLICATION_SECRET or create manifest.local.json.',
  );
};

(function () {
  console.log('Started bundle build, you will see a message in a minute...');

  if (!shell.exec('npm run build')) {
    console.log('Error while preparing build');
    return;
  }

  fs.readFile(FILENAME, (err, buf) => {
    if (!err) {
      const manifest = resolveManifest();
      const fileMd5 = md5(buf),
        signParts = [
          manifest.applicationId,
          fileMd5,
          manifest.applicationSecret,
        ],
        sign = md5(signParts.join(':'));

      const formData = {
        application_id: manifest.applicationId,
        sign,
        bundle: fs.createReadStream(`./${FILENAME}`),
      };

      r.post({
        url: URL,
        formData,
      }, (err, response, body) => {
        if (!err) {
          try {
            body = JSON.parse(body);

            if (body.error) {
              throw new Error(JSON.stringify(body));
            }

            console.log(`Bundle successfully sent to Poster using ${manifest.source}`);
          } catch (e) {
            console.log('Error while send bundle to Poster...');
            console.log(e);
          }
        } else {
          console.log('Error while send bundle to Poster...');
          console.log(err);
        }
      });
    } else {
      console.log(`Error while reading ${FILENAME}`);
      console.log(err);
    }
  });
}());
