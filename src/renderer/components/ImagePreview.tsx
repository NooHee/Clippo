import React, { useEffect, useState } from 'react';

interface ImagePreviewProps {
  imageName: string;
  createdAt: number;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ imageName, createdAt }) => {
  const [imagePath, setImagePath] = useState<string | null>(null);

  useEffect(() => {
    window.clipstack.getImagePath(imageName).then(setImagePath).catch(() => setImagePath(null));
  }, [imageName]);

  if (!imagePath) {
    return <div className="item-content"><span className="item-preview">[Image Loading...]</span></div>;
  }

  return (
    <div className="item-image-container">
      <img
        src={imagePath}
        alt="clipboard item"
        className="item-image"
      />
      <span className="item-time">{new Date(createdAt).toLocaleDateString()}</span>
    </div>
  );
};
