<?php

use App\Http\Controllers\ExportData\ExportDataAddons;
use App\Http\Controllers\ExportData\ExportDataAllController;
use App\Http\Controllers\ExportData\ExportDataCountries;
use App\Http\Controllers\ExportData\ExportDataCrew;
use App\Http\Controllers\ExportData\ExportDataCustomer;
use App\Http\Controllers\ExportData\ExportDataDestinations;
use App\Http\Controllers\ExportData\ExportDataHotel;
use App\Http\Controllers\ExportData\ExportDataItineraryCore;
use App\Http\Controllers\ExportData\ExportDataPackage;
use App\Http\Controllers\ExportData\ExportDataPriceTiers;
use App\Http\Controllers\ExportData\ExportDataVehicles;
use App\Http\Controllers\ExportData\ExportIncludeExclude;
use App\Http\Controllers\ExportData\ExportDataActivities;
use App\Http\Controllers\ExportData\ExportDataPolicies;
use App\Http\Controllers\ExportData\ExportDataBookings;
use App\Http\Controllers\ExportData\ExportDataDiscount;
use App\Http\Controllers\ExportData\ExportDataDurations;
use App\Http\Controllers\ExportData\ExportDataOrderChannels;
use App\Http\Controllers\ExportData\ExportDataOtherActivities;
use App\Http\Controllers\ExportData\ExportDataPaymentMethods;
use App\Http\Controllers\ExportData\ExportDataVendors;
use App\Http\Controllers\ExportDataController;
use Illuminate\Support\Facades\Route;

Route::prefix('export-data')->group(function () {
    Route::prefix('hotels')->group(function () {
        Route::get('/hotels', [ExportDataHotel::class, 'hotels']);
        Route::get('/room-types', [ExportDataHotel::class, 'roomTypes']);
        Route::get('/room-configurations', [ExportDataHotel::class, 'roomConfigurations']);
    });
    Route::prefix('vehicles')->group(function () {
        Route::get('/vehicle-types', [ExportDataVehicles::class, 'vehicleTypes']);
        Route::get('/vehicle-units', [ExportDataVehicles::class, 'vehicleUnits']);
    });
    Route::prefix('crews')->group(function () {
        Route::get('/crew-roles', [ExportDataCrew::class, 'crewRoles']);
        Route::get('/crew-member', [ExportDataCrew::class, 'crewMember']);
        Route::get('/crew-member-roles', [ExportDataCrew::class, 'crewMemberRoles']);
        Route::get('/transport-crew-rules', [ExportDataCrew::class, 'transportCrewRules']);
    });
    Route::prefix('destinations')->group(function () {
        Route::get('/destinations', [ExportDataDestinations::class, 'destinations']);
    });
    Route::prefix('countries')->group(function () {
        Route::get('/countries', [ExportDataCountries::class, 'countries']);
    });
    Route::prefix('customers')->group(function () {
        Route::get('/customers', [ExportDataCustomer::class, 'customers']);
    });
    Route::prefix('packages')->group(function () {
        Route::get('/package-categories', [ExportDataPackage::class, 'packageCategories']);
        Route::get('/packages', [ExportDataPackage::class, 'packages']);
        Route::get('/package-images', [ExportDataPackage::class, 'packageImages']);
        Route::get('/package-includes', [ExportDataPackage::class, 'packageIncludes']);
        Route::get('/package-excludes', [ExportDataPackage::class, 'packageExcludes']);
        Route::get('/package-addons', [ExportDataPackage::class, 'packageAddons']);
        Route::get('/package-prices', [ExportDataPackage::class, 'packagePrices']);
        Route::get('/package-itinerary-days', [ExportDataPackage::class, 'packageItineraryDays']);
        Route::get('/package-itinerary-day-details', [ExportDataPackage::class, 'packageItineraryDayDetails']);
        Route::get('/package-destinations', [ExportDataPackage::class, 'packageDestinations']);
        Route::get('/package-hotel-options', [ExportDataPackage::class, 'packageHotelOptions']);
        Route::get('/combined-packages', [ExportDataPackage::class, 'combinedPackages']);
        Route::get('/combined-package-details', [ExportDataPackage::class, 'combinedPackageDetails']);
    });
    Route::prefix('include-exclude')->group(function () {
        Route::get('/item-includes', [ExportIncludeExclude::class, 'include']);
        Route::get('/item-excludes', [ExportIncludeExclude::class, 'exclude']);
    });
    Route::prefix('addons')->group(function () {
        Route::get('/addons', [ExportDataAddons::class, 'addons']);
    });
    Route::prefix('price-tiers')->group(function () {
        Route::get('/price-tiers', [ExportDataPriceTiers::class, 'priceTiers']);
    });
    Route::prefix('activities')->group(function () {
        Route::get('/other-activities', [ExportDataActivities::class, 'otherActivities']);
        Route::get('/destination-activities', [ExportDataActivities::class, 'destinationActivities']);
        Route::get('/activities', [ExportDataActivities::class, 'activities']);
        Route::get('/activity-categories', [ExportDataActivities::class, 'activity_categories']);
        Route::get('/activity-ends', [ExportDataActivities::class, 'activityEnds']);
        Route::get('/activity-starts', [ExportDataActivities::class, 'activityStarts']);
    });
    Route::prefix('vendors')->group(function () {
        Route::get('/vendors', [ExportDataVendors::class, 'vendors']);
        Route::get('/vendor-categories', [ExportDataVendors::class, 'vendorCategories']);
    });
    Route::prefix('order-channels')->group(function () {
        Route::get('/order-channels', [ExportDataOrderChannels::class, 'orderChannels']);
    });
    Route::prefix('policies')->group(function () {
        Route::get('/policies', [ExportDataPolicies::class, 'policies']);
    });
    Route::prefix('discount')->group(function () {
        Route::get('/discount', [ExportDataDiscount::class, 'discount']);
    });
    Route::prefix('payment-methods')->group(function () {
        Route::get('/payment-methods', [ExportDataPaymentMethods::class, 'paymentMethods']);
    });
    Route::prefix('durations')->group(function () {
        Route::get('/durations', [ExportDataDurations::class, 'durations']);
    });
    Route::prefix('bookings')->group(function () {
        Route::get('/bookings', [ExportDataBookings::class, 'bookings']);
        Route::get('/booking-payment-terms', [ExportDataBookings::class, 'bookingPaymentTerms']);
        Route::get('/booking-payment-histories', [ExportDataBookings::class, 'bookingPaymentHistories']);
        Route::get('/booking-logistics', [ExportDataBookings::class, 'bookingLogistics']);
        Route::get('/booking-police-escorts', [ExportDataBookings::class, 'bookingPoliceEscorts']);
        Route::get('/booking-tshirts', [ExportDataBookings::class, 'bookingTshirts']);
        Route::get('/booking-destination-schedules', [ExportDataBookings::class, 'bookingDestinationSchedules']);
        Route::get('/booking-whatsapp-logs', [ExportDataBookings::class, 'bookingWhatsappLogs']);
        Route::get('/booking-finances', [ExportDataBookings::class, 'bookingFinances']);
        Route::get('/booking-itineraries', [ExportDataBookings::class, 'bookingItineraries']);
        Route::get('/booking-hotels', [ExportDataBookings::class, 'bookingHotels']);
        Route::get('/booking-hotel-rooms', [ExportDataBookings::class, 'bookingHotelRooms']);
        Route::get('/booking-hotel-meals', [ExportDataBookings::class, 'bookingHotelMeals']);
        Route::get('/booking-addons', [ExportDataBookings::class, 'bookingAddons']);
        Route::get('/booking-vehicle-units', [ExportDataBookings::class, 'bookingVehcileUnits']);
        Route::get('/booking-crew-members', [ExportDataBookings::class, 'bookingCrewMembers']);
        Route::get('/booking-crew-member-activities', [ExportDataBookings::class, 'bookingCrewMemberActivities']);
        Route::get('/booking-destination-activities', [ExportDataBookings::class, 'bookingDestinationActivities']);
        Route::get('/booking-other-activities', [ExportDataBookings::class, 'bookingOtherActivities']);
    });
    Route::prefix('itinerary-core')->group(function () {
        Route::get('/bundle', [ExportDataItineraryCore::class, 'bundle']);
    });
    Route::get('/all', [ExportDataAllController::class, 'all']);
});
