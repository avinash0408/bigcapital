import { omit, sumBy } from 'lodash';
import { Service, Inject } from 'typedi';
import { IEstimatesFilter, IFilterMeta, IPaginationMeta, ISaleEstimate, ISaleEstimateDTO } from 'interfaces';
import {
  EventDispatcher,
  EventDispatcherInterface,
} from 'decorators/eventDispatcher';
import { formatDateFields } from 'utils';
import TenancyService from 'services/Tenancy/TenancyService';
import DynamicListingService from 'services/DynamicListing/DynamicListService';
import ItemsEntriesService from 'services/Items/ItemsEntriesService';
import events from 'subscribers/events';
import { ServiceError } from 'exceptions';
import CustomersService from 'services/Contacts/CustomersService';


const ERRORS = {
  SALE_ESTIMATE_NOT_FOUND: 'SALE_ESTIMATE_NOT_FOUND',
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
  SALE_ESTIMATE_NUMBER_EXISTANCE: 'SALE_ESTIMATE_NUMBER_EXISTANCE',
  ITEMS_IDS_NOT_EXISTS: 'ITEMS_IDS_NOT_EXISTS',
};
/**
 * Sale estimate service.
 * @Service
 */
@Service()
export default class SaleEstimateService {
  @Inject()
  tenancy: TenancyService;

  @Inject()
  itemsEntriesService: ItemsEntriesService;

  @Inject()
  customersService: CustomersService;

  @Inject('logger')
  logger: any;

  @Inject()
  dynamicListService: DynamicListingService;

  @EventDispatcher()
  eventDispatcher: EventDispatcherInterface;

  /**
   * Retrieve sale estimate or throw service error.
   * @param {number} tenantId 
   * @return {ISaleEstimate}
   */
  async getSaleEstimateOrThrowError(tenantId: number, saleEstimateId: number) {
    const { SaleEstimate } = this.tenancy.models(tenantId);
    const foundSaleEstimate = await SaleEstimate.query().findById(saleEstimateId);
    
    if (!foundSaleEstimate) {
      throw new ServiceError(ERRORS.SALE_ESTIMATE_NOT_FOUND);
    }
    return foundSaleEstimate;
  }
 
  /**
   * Validate the estimate number unique on the storage.
   * @param {Request} req 
   * @param {Response} res 
   * @param {Function} next 
   */
  async validateEstimateNumberExistance(tenantId: number, estimateNumber: string, notEstimateId?: number) {
    const { SaleEstimate } = this.tenancy.models(tenantId);

    const foundSaleEstimate = await SaleEstimate.query()
      .findOne('estimate_number', estimateNumber)
      .onBuild((builder) => {
        if (notEstimateId) {
          builder.whereNot('id', notEstimateId);
        }
      });
    if (foundSaleEstimate) {
      throw new ServiceError(ERRORS.SALE_ESTIMATE_NUMBER_EXISTANCE);
    }
  }

  /**
   * Creates a new estimate with associated entries.
   * @async
   * @param {number} tenantId - The tenant id.
   * @param {EstimateDTO} estimate
   * @return {Promise<ISaleEstimate>}
   */
  public async createEstimate(tenantId: number, estimateDTO: ISaleEstimateDTO): Promise<ISaleEstimate> {
    const { SaleEstimate, ItemEntry } = this.tenancy.models(tenantId);

    this.logger.info('[sale_estimate] inserting sale estimate to the storage.');

    const amount = sumBy(estimateDTO.entries, e => ItemEntry.calcAmount(e));
    const estimateObj = {
      amount,
      ...formatDateFields(estimateDTO, ['estimate_date', 'expiration_date']),
    };

    // Validate estimate number uniquiness on the storage.
    await this.validateEstimateNumberExistance(tenantId, estimateDTO.estimateNumber);
    
    // Retrieve the given customer or throw not found service error.
    await this.customersService.getCustomer(tenantId, estimateDTO.customerId);

    // Validate items IDs existance on the storage.
    await this.itemsEntriesService.validateItemsIdsExistance(tenantId, estimateDTO.entries);

    // Validate non-sellable items.
    await this.itemsEntriesService.validateNonSellableEntriesItems(tenantId, estimateDTO.entries);

    const saleEstimate = await SaleEstimate.query()
      .upsertGraphAndFetch({
        ...omit(estimateObj, ['entries']),
        entries: estimateObj.entries.map((entry) => ({ 
          reference_type: 'SaleEstimate',
          ...omit(entry, ['total', 'amount', 'id']),
        }))
      });

    this.logger.info('[sale_estimate] insert sale estimated success.');
    await this.eventDispatcher.dispatch(events.saleEstimates.onCreated);

    return saleEstimate;
  }

  /**
   * Edit details of the given estimate with associated entries.
   * @async
   * @param {number} tenantId - The tenant id.
   * @param {Integer} estimateId
   * @param {EstimateDTO} estimate
   * @return {void}
   */
  public async editEstimate(tenantId: number, estimateId: number, estimateDTO: ISaleEstimateDTO): Promise<ISaleEstimate> {
    const { SaleEstimate, ItemEntry } = this.tenancy.models(tenantId);
    const oldSaleEstimate = await this.getSaleEstimateOrThrowError(tenantId, estimateId);

    const amount = sumBy(estimateDTO.entries, (e) => ItemEntry.calcAmount(e));
    const estimateObj = {
      amount,
      ...formatDateFields(estimateDTO, ['estimate_date', 'expiration_date']),
    };

    // Validate estimate number uniquiness on the storage.
    await this.validateEstimateNumberExistance(tenantId, estimateDTO.estimateNumber, estimateId);

    // Retrieve the given customer or throw not found service error.
    await this.customersService.getCustomer(tenantId, estimateDTO.customerId);

    // Validate sale estimate entries existance.
    await this.itemsEntriesService.validateEntriesIdsExistance(tenantId, estimateId, 'SaleEstiamte', estimateDTO.entries);

    // Validate items IDs existance on the storage.
    await this.itemsEntriesService.validateItemsIdsExistance(tenantId, estimateDTO.entries);

    // Validate non-sellable items.
    await this.itemsEntriesService.validateNonSellableEntriesItems(tenantId, estimateDTO.entries);

    this.logger.info('[sale_estimate] editing sale estimate on the storage.');
    const saleEstimate = await SaleEstimate.query()
      .upsertGraphAndFetch({
        id: estimateId,
        ...omit(estimateObj, ['entries']),
        entries: estimateObj.entries.map((entry) => ({
          reference_type: 'SaleEstimate',
          ...omit(entry, ['total', 'amount']),
        })),
      });

    await this.eventDispatcher.dispatch(events.saleEstimates.onEdited, {
      tenantId, estimateId, saleEstimate, oldSaleEstimate,
    });
    this.logger.info('[sale_estiamte] edited successfully', { tenantId, estimateId });

    return saleEstimate;
  }

  /**
   * Deletes the given estimate id with associated entries.
   * @async
   * @param {number} tenantId - The tenant id.
   * @param {IEstimate} estimateId
   * @return {void}
   */
  public async deleteEstimate(tenantId: number, estimateId: number): Promise<void> {
    const { SaleEstimate, ItemEntry } = this.tenancy.models(tenantId);

    // Retrieve sale estimate or throw not found service error.
    const oldSaleEstimate = await this.getSaleEstimateOrThrowError(tenantId, estimateId);

    this.logger.info('[sale_estimate] delete sale estimate and associated entries from the storage.');
    await ItemEntry.query()
      .where('reference_id', estimateId)
      .where('reference_type', 'SaleEstimate')
      .delete();

    await SaleEstimate.query().where('id', estimateId).delete();
    this.logger.info('[sale_estimate] deleted successfully.', { tenantId, estimateId });

    await this.eventDispatcher.dispatch(events.saleEstimates.onDeleted, {
      tenantId, saleEstimateId: estimateId, oldSaleEstimate,
    });
  }

  /**
   * Retrieve the estimate details with associated entries.
   * @async
   * @param {number} tenantId - The tenant id.
   * @param {Integer} estimateId
   */
  public async getEstimate(tenantId: number, estimateId: number) {
    const { SaleEstimate } = this.tenancy.models(tenantId);
    const estimate = await SaleEstimate.query()
      .findById(estimateId)
      .withGraphFetched('entries')
      .withGraphFetched('customer');
    
    if (!estimate) {
      throw new ServiceError(ERRORS.SALE_ESTIMATE_NOT_FOUND);
    }
    return estimate;
  }

  /**
   * Retrieves estimates filterable and paginated list.
   * @param {number} tenantId -
   * @param {IEstimatesFilter} estimatesFilter -
   */
  public async estimatesList(
    tenantId: number,
    estimatesFilter: IEstimatesFilter
  ): Promise<{ salesEstimates: ISaleEstimate[], pagination: IPaginationMeta, filterMeta: IFilterMeta }> {
    const { SaleEstimate } = this.tenancy.models(tenantId);
    const dynamicFilter = await this.dynamicListService.dynamicList(tenantId, SaleEstimate, estimatesFilter);

    const { results, pagination } = await SaleEstimate.query().onBuild(builder => {
      builder.withGraphFetched('customer');
      builder.withGraphFetched('entries');
      dynamicFilter.buildQuery()(builder);
    }).pagination(
      estimatesFilter.page - 1,
      estimatesFilter.pageSize,
    );

    return {
      salesEstimates: results,
      pagination,
      filterMeta: dynamicFilter.getResponseMeta(),
    };
  }
}