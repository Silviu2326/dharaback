const { supabase } = require('../config/supabase');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

/**
 * Helper: Create bucket if it doesn't exist
 */
const createBucketIfNotExists = async (bucketName) => {
  try {
    // Check if bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === bucketName);
    
    if (!bucketExists) {
      console.log(`Creating bucket: ${bucketName}`);
      const { error } = await supabase.storage.createBucket(bucketName, {
        public: true, // Make it public for profile images
        fileSizeLimit: 10485760, // 10MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      });
      
      if (error) {
        console.error(`Error creating bucket ${bucketName}:`, error);
        throw error;
      }
      
      console.log(`Bucket ${bucketName} created successfully`);
    }
  } catch (error) {
    console.error('Error in createBucketIfNotExists:', error);
    // Don't throw here, let the upload fail with its own error if bucket doesn't exist
  }
};

/**
 * @desc    Upload file to Supabase Storage
 * @route   POST /api/storage/upload
 * @access  Private
 */
const uploadFile = asyncHandler(async (req, res, next) => {
  const { bucket = 'avatars', folder = '', fileName, contentType, base64Data } = req.body;
  
  if (!base64Data || !fileName) {
    return next(new AppError('File data and fileName are required', 400));
  }

  // Ensure bucket exists
  await createBucketIfNotExists(bucket);

  // Decode base64 to buffer
  const buffer = Buffer.from(base64Data, 'base64');
  
  // Construct file path
  const filePath = folder ? `${folder}/${fileName}` : fileName;
  
  // Upload to Supabase Storage using service role key
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, buffer, {
      contentType: contentType || 'application/octet-stream',
      upsert: false,
    });

  if (error) {
    console.error('Supabase storage upload error:', error);
    return next(new AppError(error.message || 'Failed to upload file', 400));
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  res.status(200).json({
    success: true,
    data: {
      path: data.path,
      fullPath: `${bucket}/${data.path}`,
      url: publicUrl,
      bucket,
      size: buffer.length,
      uploadedAt: new Date().toISOString(),
    },
    message: 'File uploaded successfully'
  });
});

/**
 * @desc    Delete file from Supabase Storage
 * @route   DELETE /api/storage/delete
 * @access  Private
 */
const deleteFile = asyncHandler(async (req, res, next) => {
  const { bucket, path } = req.body;
  
  if (!bucket || !path) {
    return next(new AppError('Bucket and path are required', 400));
  }

  const { error } = await supabase.storage
    .from(bucket)
    .remove([path]);

  if (error) {
    console.error('Supabase storage delete error:', error);
    return next(new AppError(error.message || 'Failed to delete file', 400));
  }

  res.status(200).json({
    success: true,
    message: 'File deleted successfully'
  });
});

/**
 * @desc    Get signed URL for private files
 * @route   POST /api/storage/signed-url
 * @access  Private
 */
const getSignedUrl = asyncHandler(async (req, res, next) => {
  const { bucket, path, expiresIn = 3600 } = req.body;
  
  if (!bucket || !path) {
    return next(new AppError('Bucket and path are required', 400));
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.error('Supabase storage signed URL error:', error);
    return next(new AppError(error.message || 'Failed to create signed URL', 400));
  }

  res.status(200).json({
    success: true,
    data: {
      signedUrl: data.signedUrl,
      expiresIn
    }
  });
});

module.exports = {
  uploadFile,
  deleteFile,
  getSignedUrl
};
