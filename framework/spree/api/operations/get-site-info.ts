import type {
  OperationContext,
  OperationOptions,
} from '@commerce/api/operations'
import type { Category, GetSiteInfoOperation } from '@commerce/types/site'
import type {
  ITaxons,
  TaxonAttr,
} from '@spree/storefront-api-v2-sdk/types/interfaces/Taxon'
import { requireConfigValue } from 'framework/spree/isomorphicConfig'
import type { SpreeSdkVariables } from 'framework/spree/types'
import type { SpreeApiConfig, SpreeApiProvider } from '..'

const taxonsSort = (spreeTaxon1: TaxonAttr, spreeTaxon2: TaxonAttr): number => {
  const { left: left1, right: right1 } = spreeTaxon1.attributes
  const { left: left2, right: right2 } = spreeTaxon2.attributes

  if (right1 < left2) {
    return -1
  }

  if (right2 < left1) {
    return 1
  }

  return 0
}

export type GetSiteInfoResult<
  T extends { categories: any[]; brands: any[] } = {
    categories: Category[]
    brands: any[]
  }
> = T

export default function getSiteInfoOperation({
  commerce,
}: OperationContext<SpreeApiProvider>) {
  async function getSiteInfo<T extends GetSiteInfoOperation>(opts?: {
    config?: Partial<SpreeApiConfig>
    preview?: boolean
  }): Promise<T['data']>

  async function getSiteInfo<T extends GetSiteInfoOperation>(
    opts: {
      config?: Partial<SpreeApiConfig>
      preview?: boolean
    } & OperationOptions
  ): Promise<T['data']>

  async function getSiteInfo<T extends GetSiteInfoOperation>({
    query,
    variables: getSiteInfoVariables = {},
    config: userConfig,
  }: {
    query?: string
    variables?: any
    config?: Partial<SpreeApiConfig>
    preview?: boolean
  } = {}): Promise<GetSiteInfoResult> {
    console.info(
      'getSiteInfo called. Configuration: ',
      'query: ',
      query,
      'getSiteInfoVariables ',
      getSiteInfoVariables,
      'config: ',
      userConfig
    )

    // Fetch first and level taxons

    const createVariables = (parentId: string): SpreeSdkVariables => ({
      methodPath: 'taxons.list',
      arguments: [
        {
          filter: {
            parent_id: parentId,
          },
        },
      ],
    })

    const config = commerce.getConfig(userConfig)
    const { fetch: apiFetch } = config // TODO: Send config.locale to Spree.

    const {
      data: { data: spreeCategoriesSuccessResponse },
    } = await apiFetch<{
      data: ITaxons
    }>('__UNUSED__', {
      variables: createVariables(
        requireConfigValue('spreeCategoriesTaxonomyId') as string
      ),
    })

    const {
      data: { data: spreeBrandsSuccessResponse },
    } = await apiFetch<{
      data: ITaxons
    }>('__UNUSED__', {
      variables: createVariables(
        requireConfigValue('spreeBrandsTaxonomyId') as string
      ),
    })

    const normalizedCategories: GetSiteInfoOperation['data']['categories'] =
      spreeCategoriesSuccessResponse.data.sort(taxonsSort).map((spreeTaxon) => {
        return {
          id: spreeTaxon.id,
          name: spreeTaxon.attributes.name,
          slug: spreeTaxon.id,
          path: spreeTaxon.id,
        }
      })

    const normalizedBrands: GetSiteInfoOperation['data']['brands'] =
      spreeBrandsSuccessResponse.data.sort(taxonsSort).map((spreeTaxon) => {
        return {
          node: {
            entityId: spreeTaxon.id,
            path: `brands/${spreeTaxon.id}`,
            name: spreeTaxon.attributes.name,
          },
        }
      })

    return {
      categories: normalizedCategories,
      brands: normalizedBrands,
    }
  }

  return getSiteInfo
}
