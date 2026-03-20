const path = require('path');
const fs = require('fs');
const { supabase } = require('../config/supabase');

/**
 * Uploads a file to Supabase Storage
 * @param {string} filePath - Local path to the file
 * @param {string} fileName - Original filename
 * @param {string} userId - User ID for organizing files
 * @returns {Promise<{path: string, publicUrl: string}>}
 */
const uploadToSupabaseStorage = async (filePath, fileName, userId) => {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const fileExt = path.extname(fileName);
    const uniqueFileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(2, 15)}${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from('documents')
      .upload(uniqueFileName, fileBuffer, {
        contentType: filePath.mimetype || 'application/octet-stream',
        upsert: false
      });
    
    if (error) {
      console.error('Error uploading to Supabase Storage:', error);
      throw error;
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('documents')
      .getPublicUrl(data.path);
    
    return {
      path: data.path,
      publicUrl: publicUrl
    };
  } catch (error) {
    console.error('Supabase Storage upload failed:', error);
    throw error;
  }
};

module.exports = {
  uploadToSupabaseStorage
};
