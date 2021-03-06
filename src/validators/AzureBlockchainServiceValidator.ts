// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ResourceGroups } from 'azure-arm-resource/lib/resource/operations';
import { ConsortiumResource, MemberResource } from '../ARMBlockchain';
import { Constants } from '../Constants';
import { Debounce } from './debounceValidation';
import { Validator } from './validator';

const debounce = new Debounce();

export namespace AzureBlockchainServiceValidator {
  const {
    specialChars,
    forbiddenChars,
  } = Constants.validationRegexps;

  const {
    unresolvedSymbols,
  } = Constants.validationMessages;

  export async function validateAccessPassword(password: string): Promise<string | null> {
    return new Validator(password)
      .isNotEmpty()
      .hasLowerCase()
      .hasUpperCase()
      .hasDigit()
      .hasSpecialChar(specialChars.password)
      .hasNoForbiddenChar(
        forbiddenChars.password,
        unresolvedSymbols(Constants.validationMessages.forbiddenChars.password))
      .inLengthRange(Constants.minPasswordLength, Constants.maxPasswordLength)
      .getErrors();
  }

  export async function validateResourceGroupName(
    name: string,
    resourceGroups: ResourceGroups,
  ): Promise<string | null> {

    const errors = new Validator(name)
      .isNotEmpty()
      .hasSpecialChar(specialChars.resourceGroupName)
      .hasNoForbiddenChar(
        forbiddenChars.dotAtTheEnd,
        unresolvedSymbols(Constants.validationMessages.forbiddenChars.dotAtTheEnd))
      .hasNoForbiddenChar(
        forbiddenChars.resourceGroupName,
        unresolvedSymbols(Constants.validationMessages.forbiddenChars.resourceGroupName))
      .inLengthRange(Constants.minResourceGroupLength, Constants.maxResourceGroupLength)
      .getErrors();

    if (errors) {
      return Constants.validationMessages.invalidResourceGroupName;
    }

    const timeOverFunction = buildTimeOverFunction(
      name,
      resourceGroups.checkExistence.bind(resourceGroups),
      Constants.validationMessages.resourceGroupAlreadyExists,
    );

    return await debounce.debounced(timeOverFunction);
  }

  export async function validateConsortiumName(
    name: string,
    consortiumResource: ConsortiumResource,
  ): Promise<string | null> {
    const errors = new Validator(name)
      .isNotEmpty()
      .hasSpecialChar(specialChars.consortiumMemberName)
      .inLengthRange(Constants.minConsortiumAndMemberLength, Constants.maxConsortiumAndMemberLength)
      .getErrors();

    if (errors) {
      return Constants.validationMessages.invalidAzureName;
    }

    const timeOverFunction = buildTimeOverFunction(
      name,
      consortiumResource.checkExistence.bind(consortiumResource),
    );

    return await debounce.debounced(timeOverFunction);
  }

  export async function validateMemberName(
    name: string,
    memberResource: MemberResource,
  ) {
    const errors = new Validator(name)
      .isNotEmpty()
      .hasSpecialChar(specialChars.consortiumMemberName)
      .inLengthRange(Constants.minConsortiumAndMemberLength, Constants.maxConsortiumAndMemberLength)
      .getErrors();

    if (errors) {
      return Constants.validationMessages.invalidAzureName;
    }

    const timeOverFunction = buildTimeOverFunction(
      name,
      memberResource.checkExistence.bind(memberResource),
    );

    return await debounce.debounced(timeOverFunction);
  }

  function buildTimeOverFunction(
    name: string,
    checkExistence: (name: string) => Promise<any>,
    errorFunction?: (error: string) => string,
  ): () => Promise<string | null> {
    return async () => {
      const validator = new Validator(name);

      await validator.isAvailable(
        checkExistence,
        errorFunction,
      );

      return validator.getErrors();
    };
  }
}
