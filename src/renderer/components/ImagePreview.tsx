import React, { useState } from 'react';
import { thumbnailUrl } from '../../shared/thumbnailUrl';

interface ImagePreviewProps {
  imageName: string;
  createdAt: number;
}

/**
 * The thumbnail is a plain URL served by the main process through the `clippo-image://`
 * protocol, so Chromium loads, decodes and caches it off the main thread. `loading="lazy"`
 * skips rows that are scrolled out of view.
 */
export const ImagePreview: React.FC<ImagePreviewProps> = ({ imageName, createdAt }) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <div className="item-content"><span className="item-preview">[Image]</span></div>;
  }

  return (
    <div className="item-image-container">
      <img
        src={thumbnailUrl(imageName)}
        alt="clipboard item"
        className="item-image"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
      <span className="item-time">{new Date(createdAt).toLocaleDateString()}</span>
    </div>
  );
};
