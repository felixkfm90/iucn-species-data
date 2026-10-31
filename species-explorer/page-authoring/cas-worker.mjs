import { createSqlitePageAuthoringRepository } from './repository.mjs';
const input=JSON.parse(process.argv[2]);
const repository=createSqlitePageAuthoringRepository({filename:input.filename,localStorageConfirmed:true});
process.send({ready:true});
process.once('message',()=>{
  try {const result=repository.commit(input.change);process.send({ok:true,revision:result.draft.revision});}
  catch(error){process.send({ok:false,code:error.code});}
  finally{repository.close();process.disconnect();}
});
