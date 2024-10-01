const { Contract } = require("fabric-contract-api");
const ClientIdentity = require('fabric-shim').ClientIdentity;

class KVContract extends Contract {
  constructor() {
    super("KVContract");
  }

  async registerPatient(ctx, firstName, lastName, hash) {
    const newPatient = {
      docType: "patient",
      fullname: `${firstName} ${lastName}`,
      recordId: null,
    };

    const buffer = Buffer.from(JSON.stringify(newPatient));
    await ctx.stub.putState(hash, buffer);

    return { success: "OK" };
  }

  async getPatient(ctx, patientId) {
    const buffer = await ctx.stub.getState(patientId);

    if (!buffer || buffer.length === 0) {
      throw new Error(`The patient with ID ${patientId} does not exist`);
    }

    const patient = JSON.parse(buffer.toString());

    return patient;
  }

  async patientExists(ctx, patientId) {
    const isPatient = await ctx.stub.getState(patientId);

    return isPatient && isPatient.length > 0;
  }

  async getAllPatients(ctx) {
    let queryString = {};
    queryString.selector = {};
    queryString.selector.docType = 'patient';
    return await this.GetQueryResultForQueryString(ctx, JSON.stringify(queryString));
  }

  async registerDoctor(ctx, firstName, lastName, hash) {
    const newDoctor = {
      docType: "doctor",
      fullname: `${firstName} ${lastName}`,
      accessList: [],
    };

    const buffer = Buffer.from(JSON.stringify(newDoctor));
    await ctx.stub.putState(hash, buffer);

    return { success: "OK" };
  }

  async getDoctor(ctx, doctorId) {
    const buffer = await ctx.stub.getState(doctorId);

    if (!buffer || buffer.length === 0) {
      throw new Error(`The doctor with ID ${doctorId} does not exist`);
    }

    const doctor = JSON.parse(buffer.toString());

    return doctor;
  }

  async doctorExists(ctx, doctorId) {
    const isDoctor = await ctx.stub.getState(doctorId);

    return isDoctor && isDoctor.length > 0;
  }

  async getAllDoctors(ctx) {
    let queryString = {};
    queryString.selector = {};
    queryString.selector.docType = 'doctor';
    return await this.GetQueryResultForQueryString(ctx, JSON.stringify(queryString));
  }

  async registerFacility(ctx, facilityName, hash) {
    const newFacility = {
      docType: "facility",
      facilityName,
    };

    const buffer = Buffer.from(JSON.stringify(newFacility));
    await ctx.stub.putState(hash, buffer);

    return { success: "OK" };
  }

  async getAllFacilities(ctx) {
    let queryString = {};
    queryString.selector = {};
    queryString.selector.docType = 'facility';
    return await this.GetQueryResultForQueryString(ctx, JSON.stringify(queryString));
  }

  async registerEntity(ctx, entityName, hash) {
    const newEntity = {
      docType: "entity",
      entityName,
    };

    const buffer = Buffer.from(JSON.stringify(newEntity));
    await ctx.stub.putState(hash, buffer);

    return { success: "OK" };
  }

  async getAllEntities(ctx) {
    let queryString = {};
    queryString.selector = {};
    queryString.selector.docType = 'entity';
    return await this.GetQueryResultForQueryString(ctx, JSON.stringify(queryString));
  }

  async createRecord(ctx, recordId, patientId, doctorId, facilityId, metadata) {
    const newRecord = {
      docType: "record",
      ownerList: [patientId, doctorId, facilityId],
      metadata,
      createdAt: this._getNow(ctx),
      updatedAt: this._getNow(ctx),
    };
    let newRecordId = recordId;

    const [oldRecordBuffer, patient] = await Promise.all([ctx.stub.getState(recordId), this.getPatient(ctx, patientId)]);

    if (oldRecordBuffer && oldRecordBuffer.length > 0) {
      const oldRecord = JSON.parse(oldRecordBuffer.toString());
      newRecord.createdAt = oldRecord.createdAt;
    }

    if (patient.recordId) {
      await ctx.stub.putState(patient.recordId, Buffer.from(JSON.stringify(newRecord)));
      return { success: 'OK' };
    }

    patient.recordId = newRecordId;
    await Promise.all([ctx.stub.putState(patientId, Buffer.from(JSON.stringify(patient))), ctx.stub.putState(newRecordId, Buffer.from(JSON.stringify(newRecord)))]);
    return { success: "OK" };
  }

  async getRecord(ctx, recordId) {
    const entityId = await this.getCallerId(ctx);
    const queryString = {
      selector: {
        docType: "grant",
        recordId,
        entityId: entityId
      }
    };
    const [recordAsBytes, grantData] = await Promise.all([ctx.stub.getState(recordId), this.GetQueryResultForQueryString(ctx, JSON.stringify(queryString))]);
    if (!recordAsBytes || recordAsBytes.length === 0) {
      throw new Error(`The record with ID ${recordId} does not exist`);
    }
    console.log(grantData);
    let hasAccess = grantData.some(grant => grant.Record.entityId === entityId && grant.Record.recordId === recordId);
    if (hasAccess) {
      const record = JSON.parse(recordAsBytes.toString());
      return {
        metadata: JSON.parse(record.metadata),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }
    } else {
      return { success: false, message: "You are not authorized to access this record" };
    }
  }

  async getAllRecords(ctx) {
    let queryString = {};
    queryString.selector = {};
    queryString.selector.docType = 'record';
    return await this.GetQueryResultForQueryString(ctx, JSON.stringify(queryString));
  }

  async grantAccess(ctx, recordId, entityId, paymentTxId) {
    const txID = ctx.stub.getTxID();
    const newGrant = {
      docType: "grant",
      recordId,
      entityId,
      paymentTxId,
      createdAt: this._getNow(ctx),
    };
    let queryString = {
      selector: {
        docType: "grant",
        recordId,
        entityId
      }
    };
    // Check if the record exists
    const [recordBuffer, entityBuffer, grantData] = await Promise.all([ctx.stub.getState(recordId), ctx.stub.getState(entityId), this.GetQueryResultForQueryString(ctx, JSON.stringify(queryString))]);

    console.log(grantData);

    let alreadyHasAccess = grantData.some(grant => grant.Record.entityId === entityId && grant.Record.recordId === recordId);
    if (!recordBuffer || recordBuffer.length === 0) {
      throw new Error(`The record with ID ${recordId} does not exist`);
    }

    if (!entityBuffer || entityBuffer.length === 0) {
      throw new Error(`The entity with ID ${entityId} does not exist`);
    }

    if (alreadyHasAccess) {
      throw new Error(`The entity with ID ${entityId} already has an access to the record with ID ${recordId}`);
    }

    // Update the record in the ledger
    await ctx.stub.putState(txID, Buffer.from(JSON.stringify(newGrant)));

    return { success: "Access granted" };
  }

  async GetQueryResultForQueryString(ctx, queryString) {
    let resultsIterator = await ctx.stub.getQueryResult(queryString);
    let results = await this._GetAllResults(resultsIterator, false);

    return results;
  }

  _getNow(ctx) {
    const timestamp = ctx.stub.getTxTimestamp();
    const transactionTime = new Date(timestamp.getSeconds() * 1000).toISOString();
    return transactionTime;
  }

  async _GetAllResults(iterator, isHistory) {
    let allResults = [];
    let res = await iterator.next();
    while (!res.done) {
      if (res.value && res.value.value.toString()) {
        let jsonRes = {};
        if (isHistory && isHistory === true) {
          jsonRes.TxId = res.value.txId;
          jsonRes.Timestamp = res.value.timestamp;
          jsonRes.Value = JSON.parse(res.value.value.toString('utf8'));
        } else {
          jsonRes.Key = res.value.key;
          jsonRes.Record = JSON.parse(res.value.value.toString('utf8'));
        }
        allResults.push(jsonRes);
      }
      res = await iterator.next();
    }
    iterator.close();
    return allResults;
  }

  async getCallerId(ctx) {
    let clientIdentity = new ClientIdentity(ctx.stub);
    let id = clientIdentity.getID();

    let dnElements = id.split('/');
    let cnElement = dnElements.find(element => element.startsWith('CN='));
    let commonName = cnElement.replace('CN=', '');

    return commonName.split('::')[0];
  }
}

module.exports = KVContract;