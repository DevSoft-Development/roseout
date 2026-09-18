export const ADMIN_LOCATION_ENRICHMENT_FIELDS = `
  id,name,restaurant_name,activity_name,location_type,address,formatted_address,city,state,zip_code,postal_code,borough,neighborhood,market,
  latitude,longitude,description,phone,website,rating,review_count,primary_category,cuisine,cuisine_type,activity_type,primary_tag,
  google_place_id,google_types,google_maps_url,google_enrichment_status,google_rating,google_user_rating_count,
  main_image,image_url,images,gallery_images,owner_photo_urls,owner_primary_photo_url,has_photos,photo_status,photo_source,photo_storage_path,
  import_source,source,source_table,enrichment_status,last_enriched_at,status,duplicate_status,quality_score,quality_status,data_status,
  is_hidden,is_low_level,low_level_reason,public_visibility_tier,curation_tier,source_quality_status,import_confidence,
  search_boost,is_featured,date_score,tags,vibe_tags,best_for_tags,search_keywords,review_keywords,date_style_tags,best_for,special_features,signature_items,
  semantic_tags,intent_tags,semantic_search_text
`;

export const ADMIN_LOCATION_SEARCH_DOCUMENT_FIELDS = `
  id,search_document,name,restaurant_name,activity_name,location_type,category,primary_category,cuisine,description,primary_tag,
  semantic_tags,best_for_tags,best_for,review_keywords,tags,search_keywords,intent_tags,vibe_tags,date_style_tags,special_features,semantic_search_text
`;

export const ADMIN_LOCATION_SUMMARY_FIELDS = `
  id,name,restaurant_name,activity_name,location_type,source_table,address,city,state,zip_code,phone,email,owner_email,claimed_by_email,image_url,logo_url,main_image
`;

export const LOCATION_SEARCH_PROFILE_FIELDS = `
  location_id,primary_domain,supported_domains,restaurant_categories,cuisines,foods,activity_categories,nightlife_categories,meal_periods,features,audiences,occasions,vibes,
  canonical_terms,exclusions,search_text,latitude,longitude,market,city,neighborhood,borough,county,state,classification_sources,evidence,manual_overrides,confidence,
  needs_review,review_reasons,reviewed_at,reviewed_by,profile_version,profile_hash,generated_at,updated_at,verified_at,verified_by,verification_source,verification_note,taxonomy_version
`;

export const LOCATION_SEARCH_PROFILE_RUN_FIELDS = `
  id,run_type,mode,status,filters,configuration,requested_by,requested_at,started_at,completed_at,cancelled_at,cancellation_requested_at,
  total_targeted,total_processed,total_succeeded,total_failed,total_skipped,total_needs_review,target_count,processed_count,succeeded_count,failed_count,skipped_count,needs_review_count,
  cursor_value,batch_size,current_batch,error_summary,created_at,updated_at
`;

export const LOCATION_ENRICHMENT_RUN_FIELDS = `
  id,status,mode,source_table,stale_days,batch_size,max_api_calls,estimated_records,estimated_api_calls,processed_records,matched_records,review_records,no_match_records,failed_records,
  actual_api_calls,batches_completed,created_by,created_at,started_at,paused_at,completed_at,updated_at,enriched_records,unchanged_records,skipped_records,profiles_queued_records,
  photos_cached_records,cursor_location_id
`;

export const LOCATION_ENRICHMENT_EVENT_FIELDS = `id,run_id,event_type,message,created_at`;

export const GOOGLE_FOOD_SUGGESTION_FIELDS = `
  id,source_table,source_id,google_place_id,location_name,google_display_name,match_confidence,suggested_food_terms,suggested_cuisine_terms,suggested_category_terms,
  suggested_feature_terms,suggested_search_keywords,suggested_semantic_tags,suggested_intent_tags,google_types,google_primary_type,status,reviewed_by,reviewed_at,applied_at,created_at
`;

export const RESTAURANT_ADMIN_FIELDS = `
  id,restaurant_name,name,cuisine,cuisine_type,food_type,primary_category,primary_tag,description,address,formatted_address,city,state,zip_code,postal_code,neighborhood,borough,
  latitude,longitude,phone,email,website,website_url,reservation_link,reservation_url,booking_url,external_reservation_url,image_url,main_image,images,logo_url,rating,review_count,
  price_range,price_level,status,is_claimed,claimed,is_verified,is_featured,is_hidden,is_searchable,quality_score,quality_status,data_status,has_photos,photo_status,
  google_place_id,google_types,google_maps_url,google_primary_type,google_rating,google_user_rating_count,tags,vibe_tags,best_for_tags,best_for,special_features,signature_items,
  search_keywords,review_keywords,date_style_tags,atmosphere,lighting,noise_level,dress_code,parking_info,operating_hours,special_hours,holiday_closures,
  reservation_enabled,reservation_type,max_party_size,reservation_interval_minutes,turn_time_minutes,booking_cutoff_minutes,cancellation_policy,
  claim_url,claim_qr_url,qr_link,qr_code_data_url,claim_code,claim_status,created_at,updated_at
`;
