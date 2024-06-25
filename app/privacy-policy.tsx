// @/app/account.tsx
import React, { useState } from "react";
import { StyleSheet, View, ScrollView } from "react-native";
import { ThemedButton, ThemedScreen, ThemedText } from "@/components";
import Icon from "react-native-vector-icons/MaterialIcons";
import { router } from "expo-router";
import { PricingBlock } from "@/components/PricingBlock";
import { useThemeColor } from "@/hooks/useThemeColor";
import Markdown from "react-native-markdown-display";
const privacyPolicyMarkdownContent = `
### Privacy Policy

This web page represents a legal document that serves as our Terms of Use and Privacy Policy and it governs the use of our website:  [https://languageplayer.io](https://languageplayer.io) , including pages found thereon and all sub-domains and apps (collectively, "Website"), as owned and operated by us, Zero to Hero Education, Canada. ("Zero to Hero").

**Introduction**

The Terms of Use, along with our Privacy Policy published below, and other posted guidelines or policies within our Website (collectively "Legal Terms"), constitute the entire and only agreement between you and us, and supersede all other agreements, representations, warranties and understandings with respect to our Website and the subject matter contained herein. We may amend our Legal Terms at any time without specific notice to you. The latest copies of our Legal Terms will be posted on our Website, and you should review all Legal Terms prior to using our Website. After any revisions to our Legal Terms are posted, you agree to be bound to any such changes to them. Therefore, it is important for you to periodically review our Legal Terms to make sure you still agree to them.

By using our Website, you agree to fully comply with and be bound by our Legal Terms. Please review them carefully. If you do not accept our Legal Terms, do not access and use our Website. If you have already accessed our Website and do not accept our Legal Terms, you are no longer authorized to use it and you should immediately discontinue use of our Website. 

**Other Defined Terms On Our Website**

This Website incorporates terms defined throughout this page as well as these other defined terms: 

The terms "us" and "we" refer to Zero to Hero as the owner of the Website. "Content" includes any and all text, information, graphics, audio, video, and other data posted, offered or made available through our Website.

A "visitor" or "you" are collective identifiers that refer to you as a browser of our Website, whether or not you complete a purchase of our products.

"Personal information" means information about an identifiable person, which may include a person's name, residential address, billing address, delivery address, phone number, email address and other similar contact information, as well as Website usage history data.  It may also include a person's credit card information when presented for payment purposes.

**TERMS OF USE**

**Intellectual Property**

Our Website may contain our service marks or trademarks as well as those of our affiliates or other persons or companies, in the form of words, graphics, and logos. Your use of our Website does not constitute any right or license for you to use such service marks/trademarks, without the prior written authorization of the corresponding service mark/trademark owner. Our Website including the content is also protected under Canadian and international copyright laws. Your use of our Website or the content does not grant you ownership rights of any kind therein.  The copying, redistribution, use or publication by you of any portion of our Website or content is strictly prohibited and therefore may not to be copied or reproduced without first obtaining our written authorization.

**Limitation of Liability**

In no circumstances shall we, or our officers or employees, be responsible or liable for any loss or damages whatsoever, including (without limiting the generality of the foregoing) any direct, indirect, incidental, special, punitive or consequential damages, arising from or in connection with your use of, access to or your reliance on, or your inability to use or access, this Website, the online ordering system or any content.

**General Terms**

Our Legal Terms shall be treated as though it were executed and performed in the Province of British Columbia, Canada and shall be governed by and construed in accordance with the laws of that region without regard to conflict of law principles. In addition, you agree to submit to the personal jurisdiction and venue of the courts within that region. Any cause of action by you with respect to our Website must be instituted within one (1) year after the cause of action arose or be forever waived and barred. Should any part of our Legal Terms be held invalid or unenforceable, that portion shall be construed consistent with applicable law and the remaining portions shall remain in full force and effect. To the extent that any content conflicts or is inconsistent with our Legal Terms, our Legal Terms shall supersede and be paramount the construction of them together. Our failure to enforce any provision of our Legal Terms shall not be deemed a waiver of such provision nor of the right to enforce such provision. Our rights under our Legal Terms shall survive the termination of our Legal Terms.

**Third Party Links**

When you click on links on our Website, they may direct you away from our Website to another website owned and operated by a third party. We are not responsible for the privacy practices of other third-party websites and encourage you to read their terms of use and privacy statements.  Once you leave our Website or are redirected to a third-party website or application, you are no longer governed by our Legal Terms.

**PRIVACY POLICY**

At Zero to Hero we consider privacy to be a very important matter and as such we are committed to protecting the privacy of the personal information of all visitors.   This Privacy Policy incorporates the applicable portions of the Personal Information Protection and Electronic Documents Act (Canada), the Personal Information Protection Act (Alberta) and the ten principles set out in the Canadian Standards Association (CSA) Model Code for the Protection of Personal Information (together, the "applicable privacy laws").

**Collection of Information**

We may collect personal information for any one or more of the following purposes:

*   to establish and maintain relationships with visitors;
*   to provide requested and ongoing products and services;
*   to notify you of changes to our products and services;
*   to obtain a better understanding of our visitors their requirements and preferences;
*   to develop, enhance, improve and/or market our products and services;
*   to monitor the usage of our Website;
*   to manage and improve our business and operations; and
*   to meet legal and regulatory requirements.

**  
What Do We Do With Your Information?**

When you purchase something through our online ordering system, as part of the buying and selling process, we collect your personal information.

When you browse our Website, we also automatically receive your computer's internet protocol (IP) address in order to provide us with information that helps us learn about your browser and operating system.

Permitted direct marketing (if applicable): With your permission, we may send you newsletters or emails to advertise about our stores, new products and other updates.

**Consent**

_How do you get my consent?_

When you provide us with personal information to complete a transaction, verify your credit card, place an order, arrange for a delivery or return a purchase, or post or pin any information or photos to our social media site, we infer that you consent to our collecting it and using it for that specific reason only.

If we ask for your personal information for a secondary reason, like marketing, we will either ask you directly for your expressed consent, or provide you with an opportunity to say no.

_How do I withdraw my consent?_

If after you opt-in, you change your mind, you may withdraw your consent for us to contact you, for the continued collection, use or disclosure of your information, at anytime, by notifying us.

**Disclosure**

We will not use or disclose personal information for purposes other than that for which it was collected, unless it is with your consent, if it is permitted or required by law or you violate our Terms of Use.

**Protection**

We will protect personal information by following industry best practices and implementing such reasonable safeguards as may be appropriate to the sensitivity of the information; we will make reasonable efforts to protect personal information against loss or theft, as well as unauthorized access, disclosure, copying, use or modification regardless of the format in which it is held. The legislation also allows us, for legal or business purposes, to retain personal information for as long as is reasonable and provided you have not revoked your consent.

**Security**

To protect your personal information, we take reasonable precautions and follow industry best practices to make sure it is not inappropriately lost, misused, accessed, disclosed, altered or destroyed.

**Cookies**

Our Website does not use cookies.

**Changes To This Privacy Policy**

We reserve the right to modify this privacy policy at any time, so please review it frequently. Changes and clarifications will take effect immediately upon their posting on the Website. If we make material changes to this policy, we will notify you here that it has been updated, so that you are aware of what information we collect, how we use it, and under what circumstances, if any, we use and/or disclose it.

**Questions And Contact Information**

If you would like to: access, correct, amend or delete any personal information we have about you, register a complaint, or simply want more information contact us at  [jon.long@zerotohero.ca](mailto:jon.long@zerotohero.ca) .
`;

const PrivacyPolicyScreen = () => {
  const [code, setCode] = useState("");

  const onSelect = (value) => {
    console.log("Selected:", value);
  };

  const secondaryTextColor = useThemeColor({}, "secondaryText");
  const primaryTextColor = useThemeColor({}, "primaryText");
  const semanticErrorColor = useThemeColor({}, "semanticError");

  return (
    <ThemedScreen
      title="Privacy Policy"
      onBackPress={() => {
        router.back();
      }}
    >
      <ScrollView>
        <Markdown style={{ body: { color: primaryTextColor, paddingBottom: 100 } }}>
          {privacyPolicyMarkdownContent}
        </Markdown>
      </ScrollView>
    </ThemedScreen>
  );
};

const styles = StyleSheet.create({
  item: {
    padding: 16,
  },
  button: {
    marginTop: 20,
    marginBottom: 110,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16, // Add padding to the sides if needed
    marginTop: 16, // Add top margin to separate from the content above
  },
});

export default PrivacyPolicyScreen;
