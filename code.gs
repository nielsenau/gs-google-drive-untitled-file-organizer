function doGet(e) {
  console.log("doGet called with parameters:", JSON.stringify(e.parameter));
  
  if (e.parameter && e.parameter.debug === 'true') {
    console.log("Serving debug page");
    return HtmlService.createHtmlOutputFromFile('debug.html')
      .setTitle('Debug - Untitled File Renamer')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  
  console.log("Serving main page");
  return HtmlService.createHtmlOutputFromFile('index.html')
    .setTitle('Untitled File Renamer')
    .setFaviconUrl('https://drive.usercontent.google.com/download?id=1UkLNX6CEg7oMm8ORtQg63hcWgEtrMMdr&format=png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

var CHUNK_SIZE = 20;
var MY_DRIVE_FOLDER = {id: 'root', name: 'My Drive'};
var PREVIEW_FALLBACKS = {
  docs: "Google Doc - Preview unavailable",
  sheets: "Google Sheet - Preview unavailable", 
  slides: "Google Slides - Preview unavailable"
};

function createFileData(file, isEmpty, preview) {
  return {
    id: file.getId(),
    name: file.getName(),
    url: file.getUrl(),
    dateCreated: file.getDateCreated().toLocaleDateString(),
    lastUpdated: file.getLastUpdated().toLocaleDateString(),
    thumbnail: null,
    preview: preview,
    parentFolders: getParentFolders(file),
    isEmpty: isEmpty,
    mimeType: file.getMimeType()
  };
}

function createResponse(success, data, message) {
  return success ? {success: true, ...data} : {success: false, message: message};
}

function getUntitledFiles() {
  console.log("getUntitledFiles called - starting chunked search!");
  
  try {
    var result = searchUntitledFilesChunked(0, CHUNK_SIZE);
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    console.log("First chunk found " + result.files.length + " files, hasMore: " + result.hasMore);
    
    if (result.files.length === 0) {
      return [{
        id: "no-files",
        name: "No Untitled Files Found",
        url: "#",
        dateCreated: new Date().toLocaleDateString(),
        lastUpdated: new Date().toLocaleDateString(),
        thumbnail: null,
        preview: "Great news! You don't have any files with 'Untitled' in their names. Your Drive is well organized!",
        parentFolders: [MY_DRIVE_FOLDER],
        isEmpty: false,
        mimeType: "text/plain"
      }];
    }
    
    result.files.forEach(function(file, index) {
      file._chunkInfo = {
        isFirstChunk: true,
        hasMore: result.hasMore,
        totalSoFar: result.totalFound,
        chunkIndex: index
      };
    });
    
    return result.files;
    
  } catch (error) {
    console.error("Error in getUntitledFiles: " + error.toString());
    
    return [{
      id: "error",
      name: "Error Occurred",
      url: "#",
      dateCreated: new Date().toLocaleDateString(),
      lastUpdated: new Date().toLocaleDateString(),
      thumbnail: null,
      preview: "Error searching for files: " + error.toString(),
      parentFolders: [MY_DRIVE_FOLDER],
      isEmpty: false,
      mimeType: "text/plain"
    }];
  }
}

function getNextChunk(currentIndex) {
  console.log("Getting next chunk starting from index " + currentIndex);
  return searchUntitledFilesChunked(currentIndex, CHUNK_SIZE);
}

function healthCheck() {
  console.log("Health check called!");
  return {
    status: "OK",
    timestamp: new Date().toISOString(),
    message: "Backend is responding correctly"
  };
}

function getFilePreview(file) {
  try {
    var mimeType = file.getMimeType();
    var preview = "";

    if (mimeType === MimeType.GOOGLE_DOCS) {
      try {
        preview = DocumentApp.openById(file.getId()).getBody().getText().substring(0, 200);
      } catch (docError) {
        preview = PREVIEW_FALLBACKS.docs;
      }
    } else if (mimeType === MimeType.GOOGLE_SHEETS) {
      try {
        var sheet = SpreadsheetApp.openById(file.getId()).getSheets()[0];
        var data = sheet.getDataRange().getValues();
        var previewData = [];
        for (var i = 0; i < Math.min(data.length, 3); i++) {
          previewData.push(data[i].slice(0, 3).join(", "));
        }
        preview = previewData.join("\n");
      } catch (sheetError) {
        preview = PREVIEW_FALLBACKS.sheets;
      }
    } else if (mimeType === MimeType.GOOGLE_SLIDES) {
      try {
        var slides = SlidesApp.openById(file.getId()).getSlides();
        preview = slides.length > 0 ? "Google Slides with " + slides.length + " slide(s)" : PREVIEW_FALLBACKS.slides;
      } catch (slideError) {
        preview = PREVIEW_FALLBACKS.slides;
      }
    } else {
      preview = "File type: " + mimeType;
    }
    
    return preview || "No preview available";
  } catch (e) {
    console.log("Preview error for file: " + e.toString());
    return "Could not generate a preview for this file.";
  }
}

function renameFile(fileId, newName) {
  try {
    DriveApp.getFileById(fileId).setName(newName);
    return createResponse(true, {}, "File renamed successfully.");
  } catch (e) {
    return createResponse(false, {}, "Error renaming file: " + e.toString());
  }
}

function getParentFolders(file) {
  try {
    var parents = file.getParents();
    var folderNames = [];
    while (parents.hasNext()) {
      var parent = parents.next();
      folderNames.push({
        id: parent.getId(),
        name: parent.getName()
      });
    }
    return folderNames.length > 0 ? folderNames : [MY_DRIVE_FOLDER];
  } catch (e) {
    return [MY_DRIVE_FOLDER];
  }
}

function moveFile(fileId, newFolderId) {
  return moveFileToFolder(fileId, newFolderId);
}

function getDriveMoveUrl(fileId) {
  return "https://drive.google.com/drive/folders?select=" + fileId;
}

function isFileEmpty(file) {
  try {
    var mimeType = file.getMimeType();
    
    if (mimeType === MimeType.GOOGLE_DOCS) {
      var doc = DocumentApp.openById(file.getId());
      var text = doc.getBody().getText().trim();
      return text.length === 0;
    } else if (mimeType === MimeType.GOOGLE_SHEETS) {
      var sheet = SpreadsheetApp.openById(file.getId()).getSheets()[0];
      var range = sheet.getDataRange();
      if (range.getNumRows() <= 1 && range.getNumColumns() <= 1) {
        var value = range.getCell(1, 1).getValue();
        return value === "" || value === null || value === undefined;
      }
      return false;
    } else if (mimeType === MimeType.GOOGLE_SLIDES) {
      var slides = SlidesApp.openById(file.getId()).getSlides();
      if (slides.length === 0) return true;
      
      var slide = slides[0];
      var shapes = slide.getShapes();
      if (shapes.length === 0) return true;
      
      for (var i = 0; i < shapes.length; i++) {
        try {
          var text = shapes[i].getText().asString().trim();
          if (text.length > 0) return false;
        } catch (e) {
        }
      }
      return true;
    }
    
    return file.getSize() === 0;
  } catch (e) {
    console.log("Error checking if file is empty: " + e.toString());
    return false;
  }
}

function testFunction() {
  console.log("Test function called successfully!");
  return "Test successful - script is working";
}

function searchUntitledFilesChunked(startIndex, chunkSize) {
  console.log("Chunked search starting from index " + startIndex + ", chunk size: " + chunkSize);
  
  try {
    var untitledFiles = [];
    var searchQuery = 'title contains "Untitled"';
    var files = DriveApp.searchFiles(searchQuery);
    var currentIndex = 0;
    var foundCount = 0;
    
    while (files.hasNext() && currentIndex < startIndex) {
      var file = files.next();
      var fileName = file.getName();
      
      if (fileName.toLowerCase().startsWith('untitled')) {
        currentIndex++;
      }
    }
    
    while (files.hasNext() && foundCount < chunkSize) {
      var file = files.next();
      var fileName = file.getName();
      
      if (!fileName.toLowerCase().startsWith('untitled')) {
        continue;
      }
      
      console.log("Found untitled file #" + (startIndex + foundCount + 1) + ": " + fileName);
      
      try {
        var fileData = createFileData(file, isFileEmpty(file), getFilePreview(file));
        untitledFiles.push(fileData);
        foundCount++;
        
      } catch (fileError) {
        console.error("Error processing file " + fileName + ": " + fileError.toString());
      }
    }
    
    var hasMore = false;
    if (files.hasNext()) {
      var checkCount = 0;
      while (files.hasNext() && checkCount < 10) {
        var testFile = files.next();
        if (testFile.getName().toLowerCase().startsWith('untitled')) {
          hasMore = true;
          break;
        }
        checkCount++;
      }
    }
    
    console.log("Chunk search found " + untitledFiles.length + " files, hasMore: " + hasMore);
    
    return {
      files: untitledFiles,
      hasMore: hasMore,
      currentIndex: startIndex,
      chunkSize: chunkSize,
      totalFound: startIndex + foundCount
    };
    
  } catch (error) {
    console.error("Error in chunked search: " + error.toString());
    return {
      files: [],
      hasMore: false,
      currentIndex: startIndex,
      chunkSize: chunkSize,
      totalFound: startIndex,
      error: error.toString()
    };
  }
}

var searchProgress = {
  isSearching: false,
  foundCount: 0,
  currentFiles: [],
  searchComplete: false
};

function startSearch() {
  console.log("Starting search process...");
  searchProgress.isSearching = true;
  searchProgress.foundCount = 0;
  searchProgress.currentFiles = [];
  searchProgress.searchComplete = false;
  
  setTimeout(function() {
    searchProgress.currentFiles = searchUntitledFilesAdvanced();
    searchProgress.foundCount = searchProgress.currentFiles.length;
    searchProgress.searchComplete = true;
    searchProgress.isSearching = false;
  }, 100);
  
  return {
    status: "started",
    message: "Search initiated"
  };
}

function getSearchStatus() {
  if (searchProgress.searchComplete) {
    return {
      status: "complete",
      foundCount: searchProgress.foundCount,
      files: searchProgress.currentFiles,
      isSearching: false
    };
  } else if (searchProgress.isSearching) {
    return {
      status: "searching",
      foundCount: searchProgress.foundCount,
      files: [],
      isSearching: true
    };
  } else {
    return {
      status: "not_started",
      foundCount: 0,
      files: [],
      isSearching: false
    };
  }
}

function getFileThumbnail(file) {
  try {
    var mimeType = file.getMimeType();
    var fileId = file.getId();
    
    var thumbnailUrl = "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w400-h300";
    
    var supportedTypes = [
      MimeType.GOOGLE_DOCS,
      MimeType.GOOGLE_SHEETS, 
      MimeType.GOOGLE_SLIDES,
      MimeType.PDF,
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.ms-excel',
      'application/vnd.ms-powerpoint',
      'text/plain',
      'text/html'
    ];
    
    if (supportedTypes.includes(mimeType)) {
      return thumbnailUrl;
    }
    
    if (mimeType.startsWith('image/')) {
      return thumbnailUrl;
    }
    
    return null;
    
  } catch (e) {
    console.log("Error getting thumbnail for file: " + e.toString());
    return null;
  }
}

function getFolderById(folderId) {
  if (!folderId || folderId === 'root') {
    return DriveApp.getRootFolder();
  } else {
    return DriveApp.getFolderById(folderId);
  }
}

function getFolders(parentFolderId) {
  try {
    console.log("Getting folders for parent: " + (parentFolderId || 'root'));
    
    var parentFolder = getFolderById(parentFolderId);
    var folders = [];
    var subfolders = parentFolder.getFolders();
    
    while (subfolders.hasNext()) {
      var folder = subfolders.next();
      
      var hasSubfolders = false;
      try {
        hasSubfolders = folder.getFolders().hasNext();
      } catch (e) {
        hasSubfolders = null;
      }
      
      folders.push({
        id: folder.getId(),
        name: folder.getName(),
        parentId: parentFolderId || 'root',
        hasSubfolders: hasSubfolders
      });
    }
    
    folders.sort(function(a, b) { return a.name.localeCompare(b.name); });
    
    if (!parentFolderId || parentFolderId === 'root') {
      folders.unshift({
        id: 'root',
        name: 'My Drive',
        parentId: null,
        isRoot: true,
        hasSubfolders: true
      });
    }
    
    console.log("Found " + folders.length + " folders");
    return createResponse(true, {folders: folders, parentId: parentFolderId || 'root'});
    
  } catch (error) {
    console.error("Error getting folders: " + error.toString());
    return createResponse(false, {folders: []}, "Error loading folders: " + error.toString());
  }
}

function getFolderPath(folderId) {
  try {
    if (!folderId || folderId === 'root') {
      return createResponse(true, {path: [MY_DRIVE_FOLDER]});
    }
    
    var path = [];
    var currentId = folderId;
    
    while (currentId && currentId !== 'root') {
      var folder = Drive.Files.get(currentId, {fields: 'id,title,parents'});
      path.unshift({id: folder.id, name: folder.title});
      
      currentId = (folder.parents && folder.parents.length > 0) ? folder.parents[0].id : 'root';
    }
    
    path.unshift(MY_DRIVE_FOLDER);
    return createResponse(true, {path: path});
    
  } catch (error) {
    console.error("Error getting folder path: " + error.toString());
    return createResponse(false, {path: [MY_DRIVE_FOLDER]}, "Error getting folder path: " + error.toString());
  }
}

function moveFileToFolder(fileId, destinationFolderId) {
  try {
    var file = DriveApp.getFileById(fileId);
    var destinationFolder = getFolderById(destinationFolderId);
    
    var currentParents = file.getParents();
    var currentParentIds = [];
    while (currentParents.hasNext()) {
      currentParentIds.push(currentParents.next().getId());
    }
    
    destinationFolder.addFile(file);
    
    currentParentIds.forEach(function(parentId) {
      if (parentId !== destinationFolderId) {
        try {
          DriveApp.getFolderById(parentId).removeFile(file);
        } catch (e) {
          console.log("Could not remove from parent folder: " + e.toString());
        }
      }
    });
    
    var folderName = destinationFolderId === 'root' ? 'My Drive' : 'selected folder';
    return createResponse(true, {}, "File moved successfully to " + folderName);
    
  } catch (error) {
    console.error("Error moving file: " + error.toString());
    return createResponse(false, {}, "Error moving file: " + error.toString());
  }
}