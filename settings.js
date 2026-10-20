const settings = {
  packname: 'BestBot',
  author: 'Best King',
  botName: "BestBot",
  botOwner: 'Best King',
  ownerNumber: process.env.OWNER_NUMBER || '',
  timezone: 'Africa/Lubumbashi',
  locale: 'fr-FR',
  giphyApiKey: process.env.GIPHY_API_KEY || '',
  commandMode: "private",
  maxStoreMessages: 30, 
  storeWriteInterval: 120000,
  description: "This is a bot for managing group commands and automating tasks.",
  version: "3.3",
  
};

module.exports = settings;
