import type {
  Product,
  ProductImage,
  ProductPrice,
  ProductVariant,
} from '@commerce/types/product'
import type { ProductAttr } from '@spree/storefront-api-v2-sdk/types/interfaces/Product'
import type { RelationType } from '@spree/storefront-api-v2-sdk/types/interfaces/Relationships'
import { requireConfigValue } from '../isomorphic-config'
import createGetAbsoluteImageUrl from './create-get-absolute-image-url'
import expandOptions from './expand-options'
import getMediaGallery from './get-media-gallery'
import getProductPath from './get-product-path'
import MissingPrimaryVariantError from '../errors/MissingPrimaryVariantError'
import MissingOptionTypeError from '../errors/MissingOptionTypeError'
import MissingOptionValueError from '../errors/MissingOptionValueError'
import type { SpreeSdkResponse, VariantAttr } from '@framework/types'
import { jsonApi } from '@spree/storefront-api-v2-sdk'
import { JsonApiDocument } from '@spree/storefront-api-v2-sdk/types/interfaces/JsonApi'
import type { ExpandedProductOption } from '@framework/types'

const placeholderImage = requireConfigValue('productPlaceholderImageUrl') as
  | string
  | false

const imagesOptionFilter = requireConfigValue('imagesOptionFilter') as
  | string
  | false

const normalizeProduct = (
  spreeSuccessResponse: SpreeSdkResponse,
  spreeProduct: ProductAttr
): Product => {
  const primaryVariant = jsonApi.findSingleRelationshipDocument<VariantAttr>(
    spreeSuccessResponse,
    spreeProduct,
    'primary_variant'
  )

  if (primaryVariant === null) {
    throw new MissingPrimaryVariantError(
      `Couldn't find primary variant for product with id ${spreeProduct.id}.`
    )
  }

  const sku = primaryVariant.attributes.sku

  const price: ProductPrice = {
    value: parseFloat(spreeProduct.attributes.price),
    currencyCode: spreeProduct.attributes.currency,
  }

  const hasNonMasterVariants =
    (spreeProduct.relationships.variants.data as RelationType[]).length > 1

  const showOptions =
    (requireConfigValue('showSingleVariantOptions') as boolean) ||
    hasNonMasterVariants

  let variants: ProductVariant[]
  let options: ExpandedProductOption[] = []

  const spreeVariantRecords = jsonApi.findRelationshipDocuments(
    spreeSuccessResponse,
    spreeProduct,
    'variants'
  )

  variants = spreeVariantRecords.map((spreeVariantRecord) => {
    let variantOptions: ExpandedProductOption[] = []

    if (showOptions) {
      const spreeOptionValues = jsonApi.findRelationshipDocuments(
        spreeSuccessResponse,
        spreeVariantRecord,
        'option_values'
      )

      // Only include options which are used by variants.

      spreeOptionValues.forEach((spreeOptionValue) => {
        variantOptions = expandOptions(
          spreeSuccessResponse,
          spreeOptionValue,
          variantOptions
        )

        options = expandOptions(spreeSuccessResponse, spreeOptionValue, options)
      })
    }

    return {
      id: spreeVariantRecord.id,
      options: variantOptions,
    }
  })

  const spreePrimaryVariantImageRecords = jsonApi.findRelationshipDocuments(
    spreeSuccessResponse,
    primaryVariant,
    'images'
  )

  let spreeVariantImageRecords: JsonApiDocument[]

  if (imagesOptionFilter === false) {
    spreeVariantImageRecords = spreeVariantRecords.reduce<JsonApiDocument[]>(
      (accumulatedImageRecords, spreeVariantRecord) => {
        return [
          ...accumulatedImageRecords,
          ...jsonApi.findRelationshipDocuments(
            spreeSuccessResponse,
            spreeVariantRecord,
            'images'
          ),
        ]
      },
      []
    )
  } else {
    const spreeOptionTypes = jsonApi.findRelationshipDocuments(
      spreeSuccessResponse,
      spreeProduct,
      'option_types'
    )

    const imagesFilterOptionType = spreeOptionTypes.find(
      (spreeOptionType) =>
        spreeOptionType.attributes.name === imagesOptionFilter
    )

    if (!imagesFilterOptionType) {
      throw new MissingOptionTypeError(
        `Couldn't find option type having name ${imagesOptionFilter}.`
      )
    }

    const imagesOptionTypeFilterId = imagesFilterOptionType.id
    const includedOptionValuesImagesIds: string[] = []

    spreeVariantImageRecords = spreeVariantRecords.reduce<JsonApiDocument[]>(
      (accumulatedImageRecords, spreeVariantRecord) => {
        const spreeVariantOptionValuesIdentifiers: RelationType[] =
          spreeVariantRecord.relationships.option_values.data

        const spreeOptionValueOfFilterTypeIdentifier =
          spreeVariantOptionValuesIdentifiers.find(
            (spreeVariantOptionValuesIdentifier: RelationType) =>
              imagesFilterOptionType.relationships.option_values.data.some(
                (filterOptionTypeValueIdentifier: RelationType) =>
                  filterOptionTypeValueIdentifier.id ===
                  spreeVariantOptionValuesIdentifier.id
              )
          )

        if (!spreeOptionValueOfFilterTypeIdentifier) {
          throw new MissingOptionValueError(
            `Couldn't find option value related to option type with id ${imagesOptionTypeFilterId}.`
          )
        }

        const optionValueImagesAlreadyIncluded =
          includedOptionValuesImagesIds.includes(
            spreeOptionValueOfFilterTypeIdentifier.id
          )

        if (optionValueImagesAlreadyIncluded) {
          return accumulatedImageRecords
        }

        includedOptionValuesImagesIds.push(
          spreeOptionValueOfFilterTypeIdentifier.id
        )

        return [
          ...accumulatedImageRecords,
          ...jsonApi.findRelationshipDocuments(
            spreeSuccessResponse,
            spreeVariantRecord,
            'images'
          ),
        ]
      },
      []
    )
  }

  const spreeImageRecords = [
    ...spreePrimaryVariantImageRecords,
    ...spreeVariantImageRecords,
  ]

  const productImages = getMediaGallery(
    spreeImageRecords,
    createGetAbsoluteImageUrl(requireConfigValue('imageHost') as string)
  )

  const images: ProductImage[] =
    productImages.length === 0
      ? placeholderImage === false
        ? []
        : [{ url: placeholderImage }]
      : productImages

  const slug = spreeProduct.attributes.slug
  const path = getProductPath(spreeProduct)

  return {
    id: spreeProduct.id,
    name: spreeProduct.attributes.name,
    description: spreeProduct.attributes.description,
    images,
    variants,
    options,
    price,
    slug,
    path,
    sku,
  }
}

export default normalizeProduct
