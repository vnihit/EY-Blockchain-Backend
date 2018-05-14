'use strict';
/**
 * Issues a maintenance order if maintenance is required
 *@param {org.eyunsw.blockchainapps.safetyObservation} observation - the safety_observation
 *@transaction
 */
function safety_Observation(observation) {
  var factory = getFactory();
  var s_id = observation.safetyObservationId;
  var safetyAsset = factory.newResource('org.eyunsw.blockchainapps', 'SafetyObservationAsset', s_id);

  safetyAsset.reporter = observation.reporter;
  safetyAsset.location = observation.location;
  safetyAsset.equipment = observation.equipment;
  safetyAsset.date = observation.date;
  safetyAsset.description = observation.description;
  safetyAsset.priority = observation.priority;
  safetyAsset.needMaintenance = observation.needMaintenance;
  safetyAsset.raiseNotification = observation.equipment.raiseNotification;

  return getAssetRegistry('org.eyunsw.blockchainapps.SafetyObservationAsset').then(function(assetRegistry){
  return assetRegistry.add(safetyAsset);
  });
}

/**
 **
 *@param {org.eyunsw.blockchainapps.maintenanceOrderTransaction} order - the maintenance_order
 *@transaction
 */
function maintenance_Order(order) {

    //create new maintenance order asset
    // Get the factory.
  	var today = new Date();
  if (order.safetyobs.needMaintenance){
  	if (order.equipment.warrantyExpiry >= today){
      var factory_1 = getFactory();
      var warrantyAsset = factory_1.newResource('org.eyunsw.blockchainapps', 'WarrantyClaimAsset', 'WARRANTY_'+Math.floor((Math.random()*100000000) + 1));
      warrantyAsset.manufacturer = order.equipment.manufacturer;
      warrantyAsset.equipment = order.equipment;
      warrantyAsset.purchase_date = order.equipment.date_of_purchase;
      return getAssetRegistry('org.eyunsw.blockchainapps.WarrantyClaimAsset')
      .then(function(assetRegistry){
      	return assetRegistry.add(warrantyAsset);
      });
    }
    var factory = getFactory();
    // Create a new maintenance order asset
    var orderAsset = factory.newResource('org.eyunsw.blockchainapps', 'MaintenanceOrderAsset', 'ORDERASSET_'+Math.floor((Math.random() * 1000000000000000) + 1));
    // Set the properties of the new asset
     orderAsset.location = order.location;
     orderAsset.equipment = order.equipment;
     orderAsset.date = order.date;
     orderAsset.description = order.description;
     orderAsset.priority = order.priority;
  	 orderAsset.status = order.status;
     if (order.issueImageURL){
     	orderAsset.issueImageURL = order.issueImageURL;
     }
     if (order.equipment.preferred_supplier){
     	orderAsset.status = 'SUPPLIER_CONFIRMED';
        orderAsset.equipment.supplier = order.supplier;
     }
     else{
    	orderAsset.status = 'SOURCING';
      var rfq_factory = getFactory();
      var rfq = rfq_factory.newResource('org.eyunsw.blockchainapps', 'RFQ', 'RFQ_'+orderAsset.MaintenanceOrderAssetId);
      rfq.equipment = order.equipment;
      rfq.safety_observation_description = order.description;
      rfq.max_amount = 100;
      rfq.status = 'OPEN';
      rfq.offers = null;
      rfq.chosenBid = null;

      getAssetRegistry('org.eyunsw.blockchainapps.RFQ')
       .then(function (assetRegistry){
         return assetRegistry.add(rfq);
      });
    }
     return getAssetRegistry('org.eyunsw.blockchainapps.MaintenanceOrderAsset')
        .then(function (assetRegistry) {
            return assetRegistry.add(orderAsset);
        });
	}
  else {
  	return 0;
  }
}

/**
 *
 *@param {org.eyunsw.blockchainapps.Ledger} ledgerInfo - the Ledger submission
 *@transaction
 */
function submitPayment(ledgerInfo) {
    //TODO if maintenanceOrder.status is finished:
    var threshold = 500;
    if (ledgerInfo.amount < threshold) {
        //pay straight away
        ledgerInfo.company.balance -= ledgerInfo.amount;
        ledgerInfo.supplier.balance += ledgerInfo.amount;
        //update company and supplier assets
        getParticipantRegistry('org.eyunsw.blockchainapps.Company')
        .then(function (participantRegistry) {
            return participantRegistry.update(ledgerInfo.company);
        });
        return getParticipantRegistry('org.eyunsw.blockchainapps.Supplier')
          .then(function (participantRegistry) {
              return participantRegistry.update(ledgerInfo.supplier);
          });
    }
}

/**
 *
 *@param {org.eyunsw.blockchainapps.BidOffer} offer - the bid offer
 *@transaction
 */
function BidOffer(offer) {
    var rfq = offer.rfq;
    if (rfq.status !== 'OPEN') {
        throw new Error('rfq is not OPEN for bidding');
    }
    //if there are currently no bids, create the bid array
    if (rfq.offers == null) {
        rfq.offers = [];
    }
    rfq.offers.push(offer);
    return getAssetRegistry('org.eyunsw.blockchainapps.RFQ')
        .then(function(rfqAssetRegistry) {
            //update the rfq
            return rfqAssetRegistry.update(rfq);
        });
}

/**
 *
 *@param {org.eyunsw.blockchainapps.CloseBidding} bids - close the bidding
 *@transaction
 */
function CloseBidding(bids) {
    var rfq = bids.rfq;

    if (rfq.status !== 'OPEN') {
        throw new Error('rfq is not OPEN');
    }
    var smallestOffer = null;
    //if there is atleast 1 bid offer
    if (rfq.offers && rfq.offers.length > 0) {
        //sort the bids from smallest to largest
        rfq.offers.sort(function(a,b){
            return (a.bidAmount - b.bidAmount);
        });
        //the smallest offer is the first
        //element in the offers array
        smallestOffer = rfq.offers[0];
        //proceed with this offer if it is
        //less than the maximum amount we can pay.
        if (smallestOffer.bidAmount <= rfq.max_amount) {
            rfq.status = 'CLOSED';
            rfq.chosenBid = smallestOffer;
        }

        //save our chosen bidder
        return getAssetRegistry('org.eyunsw.blockchainapps.RFQ')
            .then(function(rfqRegistry) {
                //update the rfq
                return rfqRegistry.update(rfq);
            })
    }

    //if we get here then there were no bid offers made
    return null;
}
