import {
  formatAperture,
  formatExposureBias,
  formatFileSize,
  formatFocalLength,
  formatMegapixels,
  formatShutter,
  type PhotoInfo,
} from '../decode/photoInfo';

interface InfoPanelProps {
  info?: PhotoInfo;
  fileName?: string;
  fileSize?: number;
}

export function InfoPanel({ info, fileName, fileSize }: InfoPanelProps) {
  if (!fileName) return <p className="panel-note">Open a photo to see its details.</p>;

  const exposure = [
    info?.shutter ? formatShutter(info.shutter) : null,
    info?.aperture ? formatAperture(info.aperture) : null,
    info?.iso ? `ISO ${info.iso}` : null,
  ].filter(Boolean);

  const rows: [string, string | undefined][] = [
    ['File', fileName],
    ['Camera', info?.camera],
    ['Lens', info?.lens],
    ['Exposure', exposure.length ? exposure.join('  ·  ') : undefined],
    ['Focal length', info?.focalLength ? formatFocalLength(info.focalLength) : undefined],
    [
      'Exp. comp.',
      info?.exposureBias !== undefined ? formatExposureBias(info.exposureBias) : undefined,
    ],
    [
      'Taken',
      info?.takenAt?.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    ],
    ['Size', info?.width && info?.height ? formatMegapixels(info.width, info.height) : undefined],
    ['File size', fileSize ? formatFileSize(fileSize) : undefined],
  ];

  return (
    <dl className="info-list">
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label} className="info-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
    </dl>
  );
}
