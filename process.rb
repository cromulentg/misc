#!/usr/bin/env ruby
# coding: utf-8

require 'csv'
require 'date'
require 'set'

# hours worked per year taken from OECD data for the country, except
# for Paris which was taken separately since it appears much higher than
# the rest of France. restaurants counts taken from Trip Advisor restaurants
# reported for each city

NORMS = {
  # WPY: hours worked per year
  # VPY: vacation days per year
  # HPY: public holidays per year
  # POP: city population
  # REST: restaurants
  'DK' => {
    'Capital Region of Denmark' => {
      'Copenhagen' => { WPY: 1450, VPY: 25, HPY: 11,
                        POP: 602481, REST: 2344 }
    }
  },
  'SE' => {
    'Stockholm County' => {
      'Stockholm' => { WPY: 1610, VPY: 25, HPY: 11,
                       POP: 975904, REST: 2910 },
    }
  },
  'FI' => {
    'Uusimaa' => {
      'Helsinki' => { WPY: 1650, VPY: 25, HPY: 11,
                      POP: 631695, REST: 1337 },
    }
  },
  'FR' => {
    'Île-de-France' => {
      'Paris' => { WPY: 1604, VPY: 29, HPY: 11,
                   POP: 2148000, REST: 16795 }
    }
  },
  'US' => {
    'New York' => {
      'New York City' => {
        WPY: 0, VPY: 7, HPY: 10,
        POP: 8399000, REST: 10966,
        areas: [ 'Bronx County', 'New York County',
                 'Queens County', 'Kings County',
                 'Richmond County' ]
      }
    },
    'California' => {
      'San Francisco' => {
        WPY: 0, VPY: 7, HPY: 10,
        POP: 883305, REST: 4842,
        areas: [ 'San Francisco County' ]
      }
    }
  }
}

def area_for(row)
  cc, sub1, sub2 = row.to_hash.fetch_values('country_region_code', 'sub_region_1', 'sub_region_2')

  return nil unless NORMS[cc] && NORMS[cc][sub1]

  match = NORMS[cc][sub1].select { |k, v| !v.has_key?(:areas) || v[:areas].include?(sub2) }
  return match.empty? ? nil : match.assoc(match.keys.first)
end

all_regions = Set.new
work = Hash.new { |h1, date| h1[date] = Hash.new { |h2, region| h2[region] = 0 } }
home = Hash.new { |h1, date| h1[date] = Hash.new { |h2, region| h2[region] = 0 } }
recreation = Hash.new { |h1, date| h1[date] = Hash.new { |h2, region| h2[region] = 0 } }

def normalized_work(n)
  weeks_worked = 52 - (n[:HPY] + n[:VPY]) / 7.0
  avg_weekly_hours = n[:WPY] / weeks_worked
  # the bureau of labor statistics has break downs for hours worked on weekends vs
  # weekdays, but for the purposes of this script, it isn't important unless there
  # is reason to believe that the distribution of weekday vs weekend work differs
  # substantially from the BLS' numbers:
  # avg weekday length: 8 hours
  # avg weekend length: 5.42 hours
  # percent workers on weekdays: 82.5%
  # percent workers on weekends: 33.4%
  avg_weekly_hours / 5
end

def normalized_recreation(n)
  # normalization is based on a simple economic argument: restaurants need customers
  # to survive, so - relatively speaking - a city with a higher per-capita number
  # of restaurants should spend more time per-capita *at* restaurants. this assumes
  # that the size (customer capacity) of a restaurant follows the same distribution
  # across cities. this could be improved by including (eg) bars and nightclubs,
  # number of waitstaff employees, etc., if that data can be found
  n[:REST] * 1000.0 / n[:POP]
end

CSV.open(ARGV[0], headers: true).each do |row|
  region, norms = area_for(row)
  next unless region
  all_regions << region
  work_relative = row['workplaces_percent_change_from_baseline'].to_i
  home_relative = row['residential_percent_change_from_baseline'].to_i
  recreation_relative = row['retail_and_recreation_percent_change_from_baseline'].to_i
  work[row['date']][region] = (100 + work_relative) / 100.0 * normalized_work(norms)
  home[row['date']][region] = 100 + home_relative
  recreation[row['date']][region] = (100 + recreation_relative) / 100.0 * normalized_recreation(norms)
end

headers = [ 'date' ] + all_regions.to_a

[work, home, recreation].zip(ARGV[1..-1]).each do |h, f|
  next unless f
  CSV.open(f, 'w') do |csv|
    csv << headers
    h.keys.sort.each do |date|
      r = [ date ]
      r += all_regions.to_a.map { |region| h[date][region] }
      csv << r
    end
  end
end
